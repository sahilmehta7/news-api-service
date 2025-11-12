import { Prisma, ArticleStatus, FetchStatus } from "@news-api/db";

import { fetchFeed } from "../lib/rss-parser.js";
import { sha256FromStrings } from "../lib/hash.js";
import type { WorkerContext } from "../context.js";
import { queueArticlesForEnrichment } from "./enrich-articles.js";
import { workerMetrics } from "../metrics/registry.js";

const FETCH_LOG_CONTEXT = { job: "rss-ingestion" };

export async function ingestDueFeeds(context: WorkerContext) {
  const dueFeeds = await loadDueFeeds(context);

  if (dueFeeds.length === 0) {
    context.logger.debug("No feeds due for ingestion");
    return;
  }

  context.logger.info(
    { count: dueFeeds.length },
    "Starting ingestion for due feeds"
  );

  await Promise.all(
    dueFeeds.map((feed) =>
      context.ingestionQueue.add(async () => {
        await processFeed(context, feed.id);
      })
    )
  );

  await context.ingestionQueue.onIdle();
}

export function startIngestionScheduler(context: WorkerContext) {
  let isRunning = false;
  const pollIntervalMs = Math.max(
    5_000,
    context.config.ingestion.pollIntervalMs
  );

  const execute = async () => {
    if (isRunning) {
      context.logger.warn("Ingestion already running, skipping tick");
      return;
    }

    isRunning = true;
    try {
      await ingestDueFeeds(context);
    } catch (error) {
      context.logger.error({ error }, "Ingestion tick failed");
    } finally {
      isRunning = false;
    }
  };

  void execute();

  const timer = setInterval(() => {
    void execute();
  }, pollIntervalMs);

  return {
    stop: () => {
      clearInterval(timer);
    }
  };
}

async function loadDueFeeds(context: WorkerContext) {
  const now = new Date();
  const feeds = await context.db.feed.findMany({
    where: { isActive: true }
  });

  return feeds.filter((feed) => {
    if (!feed.lastFetchAt) return true;
    const intervalMs = feed.fetchIntervalMinutes * 60_000;
    return now.getTime() - feed.lastFetchAt.getTime() >= intervalMs;
  });
}

async function processFeed(context: WorkerContext, feedId: string) {
  const { db, logger, config } = context;
  const feed = await db.feed.findUnique({
    where: { id: feedId }
  });

  if (!feed) {
    logger.warn({ feedId }, "Feed not found while processing");
    return;
  }

  const startTime = new Date();
  const durationTimer = workerMetrics.ingestionDuration.startTimer({
    feed_id: feed.id,
    status: "in_progress"
  });

  const fetchLog = await db.fetchLog.create({
    data: {
      feedId: feed.id,
      status: FetchStatus.running,
      startedAt: startTime,
      context: FETCH_LOG_CONTEXT
    }
  });

  await db.feed.update({
    where: { id: feed.id },
    data: {
      lastFetchStatus: "fetching",
      lastFetchAt: startTime
    }
  });

  try {
    const parsedFeed = await fetchFeed(
      feed.url,
      config.ingestion.defaultFetchIntervalMinutes * 1_000
    );

    const items = parsedFeed.items ?? [];
    const articleInputs = items
      .map((item) => mapRssItemToArticle(feed.id, item))
      .filter(
        (article): article is Prisma.ArticleCreateInput => article !== null
      );

    const insertedArticleIds: string[] = [];

    for (const articleInput of articleInputs) {
      const created = await db.article.upsert({
        where: {
          feedId_sourceUrl: {
            feedId: feed.id,
            sourceUrl: articleInput.sourceUrl as string
          }
        },
        update: {
          title: articleInput.title,
          summary: articleInput.summary,
          content: articleInput.content,
          author: articleInput.author,
          language: articleInput.language,
          keywords: articleInput.keywords,
          contentHash: articleInput.contentHash,
          canonicalUrl: articleInput.canonicalUrl,
          publishedAt: articleInput.publishedAt ?? null,
          fetchedAt: articleInput.fetchedAt
        },
        create: articleInput
      });

      insertedArticleIds.push(created.id);
    }

    if (insertedArticleIds.length > 0) {
      await db.articleMetadata.createMany({
        data: insertedArticleIds.map((articleId) => ({
          articleId,
          enrichmentStatus: "pending"
        })),
        skipDuplicates: true
      });

      await queueArticlesForEnrichment(context, insertedArticleIds);
    }

    await db.$transaction([
      db.feed.update({
        where: { id: feed.id },
        data: {
          lastFetchStatus: "success",
          lastFetchAt: new Date(),
          metadata: feed.metadata
        }
      }),
      db.fetchLog.update({
        where: { id: fetchLog.id },
        data: {
          status: FetchStatus.success,
          finishedAt: new Date(),
          metrics: {
            ...FETCH_LOG_CONTEXT,
            itemsParsed: items.length,
            itemsInserted: insertedArticleIds.length,
            itemsDuplicated: items.length - insertedArticleIds.length
          }
        }
      })
    ]);

    logger.info(
      {
        feedId: feed.id,
        url: feed.url,
        parsedItems: items.length,
        insertedItems: insertedArticleIds.length
      },
      "Feed ingestion succeeded"
    );

    workerMetrics.ingestionAttempts.inc({
      feed_id: feed.id,
      status: "success"
    });
    workerMetrics.ingestionArticles.inc(
      {
        feed_id: feed.id
      },
      insertedArticleIds.length
    );
    durationTimer({ feed_id: feed.id, status: "success" });
  } catch (error) {
    await db.$transaction([
      db.feed.update({
        where: { id: feed.id },
        data: {
          lastFetchStatus: "error",
          lastFetchAt: new Date()
        }
      }),
      db.fetchLog.update({
        where: { id: fetchLog.id },
        data: {
          status: FetchStatus.failure,
          finishedAt: new Date(),
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
          errorStack:
            error instanceof Error && error.stack ? error.stack : null
        }
      })
    ]);

    logger.error(
      { feedId: feed.id, url: feed.url, error },
      "Feed ingestion failed"
    );

    workerMetrics.ingestionAttempts.inc({
      feed_id: feed.id,
      status: "failure"
    });
    durationTimer({ feed_id: feed.id, status: "failure" });
  }
}

function mapRssItemToArticle(
  feedId: string,
  item: NonNullable<Awaited<ReturnType<typeof fetchFeed>>["items"]>[number]
): Prisma.ArticleCreateInput | null {
  const link = item.link ?? item.guid ?? item.id;

  if (!link) {
    return null;
  }

  const publishedAt = item.isoDate ? new Date(item.isoDate) : null;
  const author =
    typeof item.creator === "string"
      ? item.creator
      : typeof item.author === "string"
        ? item.author
        : undefined;

  const keywords = Array.isArray(item.categories)
    ? item.categories.filter(
        (category): category is string => typeof category === "string"
      )
    : [];

  const encodedContentRaw = (item as Record<string, unknown>)["content:encoded"];
  const encodedContent =
    typeof encodedContentRaw === "string" ? encodedContentRaw : null;

  const dcLanguageRaw = (item as Record<string, unknown>)["dc:language"];
  const dcLanguage =
    typeof dcLanguageRaw === "string" ? dcLanguageRaw : null;

  return {
    feedId,
    sourceUrl: link,
    canonicalUrl: item.link ?? null,
    title: item.title ?? link,
    summary: item.contentSnippet ?? null,
    content: encodedContent ?? item.content ?? null,
    author: author ?? null,
    language: dcLanguage,
    keywords: keywords as Prisma.JsonValue,
    status: ArticleStatus.ingested,
    contentHash: sha256FromStrings(
      link,
      item.title,
      encodedContent,
      item.content
    ),
    publishedAt,
    fetchedAt: new Date()
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

