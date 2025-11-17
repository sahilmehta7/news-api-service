import {
  ArticleStatus,
  EnrichmentStatus,
  type Prisma
} from "@news-api/db";

import type { WorkerContext } from "../context.js";
import { fetchHtml } from "../lib/fetch-html.js";
import { extractMetadataFromHtml } from "../lib/html-metadata.js";
import { extractArticleContent } from "../lib/article-content.js";
import { workerMetrics } from "../metrics/registry.js";
import { extractEntities } from "../lib/entities.js";

const MAX_RETRIES = 3;
const BATCH_SIZE = 20;

type PendingArticle = {
  articleId: string;
  feedId: string;
  sourceUrl: string;
  canonicalUrl: string | null;
  title: string;
  language: string | null;
  fetchedAt: Date;
  publishedAt: Date | null;
  author: string | null;
  summary: string | null;
  keywords: unknown;
  retries: number;
};

export async function processPendingArticleEnrichment(
  context: WorkerContext
) {
  const pendingArticles = await loadPendingArticles(context, BATCH_SIZE);

  if (pendingArticles.length === 0) {
    context.logger.debug("No articles pending enrichment");
    return;
  }

  context.logger.info(
    { count: pendingArticles.length },
    "Starting enrichment for pending articles"
  );

  await Promise.all(
    pendingArticles.map((article) =>
      context.enrichmentQueue.add(() =>
        enrichArticle(context, article)
      )
    )
  );

  await context.enrichmentQueue.onIdle();
  workerMetrics.enrichmentQueueSize.set(context.enrichmentQueue.size);
}

export async function queueArticlesForEnrichment(
  context: WorkerContext,
  articleIds: string[]
) {
  const uniqueIds = [...new Set(articleIds)];
  if (uniqueIds.length === 0) return;

  const articlesToQueue = await loadArticlesByIds(context, uniqueIds);

  for (const article of articlesToQueue) {
    void context.enrichmentQueue
      .add(() => enrichArticle(context, article))
      .catch((error) => {
        context.logger.error(
          { articleId: article.articleId, error },
          "Failed to enqueue article enrichment"
        );
      });
  }

  workerMetrics.enrichmentQueueSize.set(context.enrichmentQueue.size);
}

export function startEnrichmentScheduler(context: WorkerContext) {
  let isRunning = false;
  const intervalMs = Math.max(15_000, context.config.enrichment.timeoutMs);

  const execute = async () => {
    if (isRunning) {
      context.logger.debug("Enrichment already running, skipping tick");
      return;
    }

    isRunning = true;
    try {
      await processPendingArticleEnrichment(context);
    } catch (error) {
      context.logger.error({ error }, "Enrichment tick failed");
    } finally {
      isRunning = false;
    }
  };

  void execute();

  const timer = setInterval(() => {
    void execute();
  }, intervalMs);

  return {
    stop: () => {
      clearInterval(timer);
    }
  };
}

async function loadPendingArticles(
  context: WorkerContext,
  limit: number
): Promise<PendingArticle[]> {
  const records = await context.db.articleMetadata.findMany({
    where: {
      enrichmentStatus: EnrichmentStatus.pending,
      retries: { lt: MAX_RETRIES }
    },
    include: {
      article: {
        select: {
          id: true,
          feedId: true,
          sourceUrl: true,
          canonicalUrl: true,
          title: true,
          language: true,
          fetchedAt: true,
          publishedAt: true,
          author: true,
          summary: true,
          keywords: true
        }
      }
    },
    orderBy: {
      article: {
        fetchedAt: "asc"
      }
    },
    take: limit
  });

  return records
    .filter((record) => record.article)
    .map((record) => ({
      articleId: record.articleId,
      feedId: record.article.feedId,
      sourceUrl: record.article.sourceUrl,
      canonicalUrl: record.article.canonicalUrl,
      title: record.article.title,
      language: record.article.language,
      fetchedAt: record.article.fetchedAt,
      publishedAt: record.article.publishedAt,
      author: record.article.author,
      summary: record.article.summary,
      keywords: record.article.keywords,
      retries: record.retries
    }));
}

async function loadArticlesByIds(
  context: WorkerContext,
  articleIds: string[]
): Promise<PendingArticle[]> {
  if (articleIds.length === 0) {
    return [];
  }

  const records = await context.db.articleMetadata.findMany({
    where: {
      articleId: { in: articleIds },
      retries: { lt: MAX_RETRIES }
    },
    include: {
      article: {
        select: {
          id: true,
          feedId: true,
          sourceUrl: true,
          canonicalUrl: true,
          title: true,
          language: true,
          fetchedAt: true,
          publishedAt: true,
          author: true,
          summary: true,
          keywords: true
        }
      }
    }
  });

  return records
    .filter((record) => record.article)
    .map((record) => ({
      articleId: record.articleId,
      feedId: record.article.feedId,
      sourceUrl: record.article.sourceUrl,
      canonicalUrl: record.article.canonicalUrl,
      title: record.article.title,
      language: record.article.language,
      fetchedAt: record.article.fetchedAt,
      publishedAt: record.article.publishedAt,
      author: record.article.author,
      summary: record.article.summary,
      keywords: record.article.keywords,
      retries: record.retries
    }));
}

async function enrichArticle(
  context: WorkerContext,
  article: PendingArticle
) {
  const { db, logger, config } = context;

  const metadata = await db.articleMetadata.findUnique({
    where: { articleId: article.articleId }
  });

  if (
    !metadata ||
    metadata.enrichmentStatus !== EnrichmentStatus.pending ||
    metadata.retries >= MAX_RETRIES
  ) {
    logger.debug(
      { articleId: article.articleId },
      "Article skipped due to status or retry limit"
    );
    return;
  }

  const updatedMetadata = await db.articleMetadata.update({
    where: { articleId: article.articleId },
    data: {
      enrichmentStatus: EnrichmentStatus.processing,
      retries: { increment: 1 },
      errorMessage: null
    }
  });

  const attempt = updatedMetadata.retries;
  const timer = workerMetrics.enrichmentDuration.startTimer({
    status: "in_progress"
  });

  try {
    const targetUrl = article.canonicalUrl ?? article.sourceUrl;

    const { html, contentType } = await fetchHtml(
      targetUrl,
      config.enrichment.timeoutMs
    );

    const metadataResult = extractMetadataFromHtml(html, targetUrl);
    const contentResult = extractArticleContent(html, targetUrl);

    const textForEmbedding =
      contentResult.contentPlain ?? metadataResult.description ?? article.title;
    const embedding = await context.embeddingProvider.embed(textForEmbedding);

    const articleDoc: import("@news-api/search").ArticleDocument = {
      id: article.articleId,
      feed_id: article.feedId,
      source_url: article.sourceUrl,
      canonical_url: article.canonicalUrl,
      title: article.title,
      summary: article.summary ?? null,
      content: contentResult.contentPlain ?? article.title,
      author: article.author ?? null,
      language: metadataResult.language ?? article.language ?? null,
      keywords: Array.isArray(article.keywords)
        ? article.keywords.filter((k): k is string => typeof k === "string")
        : [],
      published_at: article.publishedAt?.toISOString() ?? null,
      fetched_at: article.fetchedAt.toISOString(),
      story_id: null,
      content_hash: null,
      has_embedding: true,
      embedding
    };

    const storyId = await import("../lib/search/clustering.js").then((m) =>
      m.assignStoryId(
        context.searchClient,
        context.config,
        articleDoc,
        embedding
      )
    );

    articleDoc.story_id = storyId;

    // Extract entities from plain content if available
    const entities =
      (contentResult.contentPlain ?? "").length > 0
        ? await extractEntities(contentResult.contentPlain ?? "", metadataResult.language ?? article.language ?? undefined)
        : [];

    // Check if ArticleEntity model exists (Prisma client may not be regenerated yet)
    // Use a safer check that won't throw if the property doesn't exist
    let hasArticleEntity = false;
    try {
      hasArticleEntity = "articleEntity" in db && 
        typeof (db as { articleEntity?: { deleteMany?: unknown; createMany?: unknown } }).articleEntity === "object" &&
        typeof (db as { articleEntity: { deleteMany: unknown; createMany: unknown } }).articleEntity.deleteMany === "function";
    } catch {
      hasArticleEntity = false;
    }

    const updateData: Prisma.ArticleUpdateInput = {
      language: metadataResult.language ?? article.language,
      status: ArticleStatus.enriched,
      content: contentResult.contentPlain ?? metadataResult.description ?? article.title,
      storyId
    };

    const transactionOps: Prisma.PrismaPromise<unknown>[] = [
      db.articleMetadata.update({
        where: { articleId: article.articleId },
        data: {
          enrichmentStatus: EnrichmentStatus.success,
          enrichedAt: new Date(),
          retries: attempt,
          openGraph: metadataResult.openGraph as Prisma.JsonObject,
          twitterCard: metadataResult.twitterCard as Prisma.JsonObject,
          metadata: metadataResult.additional as Prisma.JsonObject,
          faviconUrl: metadataResult.faviconUrl,
          heroImageUrl: metadataResult.heroImageUrl,
          contentType: metadataResult.contentType ?? contentType ?? null,
          languageConfidence: metadataResult.languageConfidence as Prisma.JsonObject,
          readingTimeSeconds:
            metadataResult.readingTimeSeconds ?? deriveReadingTime(contentResult.wordCount),
          wordCount: contentResult.wordCount ?? metadataResult.wordCount,
          rawContentHtml: contentResult.rawHtml,
          contentPlain: contentResult.contentPlain,
          errorMessage: null
        }
      }),
      db.article.update({
        where: { id: article.articleId },
        data: updateData
      })
    ];

    // Only process entities if model exists
    if (hasArticleEntity) {
      const articleEntity = (db as { articleEntity: { deleteMany: (args: { where: { articleId: string } }) => Promise<unknown>; createMany: (args: { data: unknown[] }) => Promise<unknown> } }).articleEntity;
      
      transactionOps.push(
        articleEntity.deleteMany({ where: { articleId: article.articleId } })
      );

      if (entities.length > 0) {
        transactionOps.push(
          articleEntity.createMany({
            data: entities.map((e) => ({
              articleId: article.articleId,
              text: e.text,
              canonical: e.canonical ?? null,
              type: e.type,
              salience: e.salience ?? null,
              start: e.start ?? null,
              end: e.end ?? null
            }))
          }),
          db.$executeRawUnsafe(
            `UPDATE articles SET entities_tsv = to_tsvector('simple', $1) WHERE id = $2::uuid`,
            entities.map((e) => e.text).join(" "),
            article.articleId
          )
        );
      } else {
        transactionOps.push(
          db.$executeRawUnsafe(
            `UPDATE articles SET entities_tsv = NULL WHERE id = $1::uuid`,
            article.articleId
          )
        );
      }
    }

    await db.$transaction(transactionOps);

    // Embeddings are stored in Elasticsearch only (via indexQueue.add below)
    // No longer storing embeddings in PostgreSQL

    context.indexQueue.add(articleDoc);

    // Queue story update if storyId was assigned
    if (storyId) {
      context.storyQueue.enqueue(storyId);
    }

    logger.info(
      {
        articleId: article.articleId,
        feedId: article.feedId,
        language: metadataResult.language ?? article.language,
        readingTimeSeconds:
          metadataResult.readingTimeSeconds ?? deriveReadingTime(contentResult.wordCount),
        wordCount: contentResult.wordCount ?? metadataResult.wordCount,
        storyId
      },
      "Article enrichment succeeded"
    );

    workerMetrics.enrichmentAttempts.inc({
      status: "success"
    });
    timer({ status: "success" });
  } catch (error) {
    const nextStatus =
      attempt >= MAX_RETRIES ? EnrichmentStatus.failed : EnrichmentStatus.pending;

    const errorMessage =
      error instanceof Error ? `${error.name}: ${error.message}` : String(error);

    await db.articleMetadata.update({
      where: { articleId: article.articleId },
      data: {
        enrichmentStatus: nextStatus,
        retries: attempt,
        enrichedAt: new Date(),
        errorMessage
      }
    });

    logger.error(
      {
        articleId: article.articleId,
        feedId: article.feedId,
        attempt,
        nextStatus,
        error: error instanceof Error
          ? { message: error.message, stack: error.stack, name: error.name }
          : { value: String(error) }
      },
      "Article enrichment failed"
    );

    workerMetrics.enrichmentAttempts.inc({
      status: "failure"
    });
    timer({ status: "failure" });
  }
}

function deriveReadingTime(wordCount: number | null): number | null {
  if (!wordCount || wordCount <= 0) {
    return null;
  }

  return Math.ceil((wordCount / 200) * 60);
}

