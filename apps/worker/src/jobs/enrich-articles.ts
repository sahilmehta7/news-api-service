import {
  ArticleStatus,
  EnrichmentStatus,
  type Prisma
} from "@news-api/db";

import type { WorkerContext } from "../context.js";
import { fetchHtml } from "../lib/fetch-html.js";
import { extractMetadataFromHtml } from "../lib/html-metadata.js";
import { workerMetrics } from "../metrics/registry.js";

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
          fetchedAt: true
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
          fetchedAt: true
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

    await db.$transaction([
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
          readingTimeSeconds: metadataResult.readingTimeSeconds,
          wordCount: metadataResult.wordCount,
          errorMessage: null
        }
      }),
      db.article.update({
        where: { id: article.articleId },
        data: {
          language: metadataResult.language ?? article.language,
          status: ArticleStatus.enriched
        }
      })
    ]);

    logger.info(
      {
        articleId: article.articleId,
        feedId: article.feedId,
        language: metadataResult.language ?? article.language,
        readingTimeSeconds: metadataResult.readingTimeSeconds
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

