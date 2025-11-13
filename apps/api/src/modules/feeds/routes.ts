import type { FastifyInstance } from "fastify";
import { Prisma, FetchStatus } from "@news-api/db";

import {
  createFeedSchema,
  feedIdSchema,
  bulkImportFeedsSchema,
  type BulkImportFeedInput,
  type FeedResponse,
  feedResponseSchema,
  updateFeedSchema
} from "./schemas.js";

const toJsonValue = (value: unknown): Prisma.InputJsonValue =>
  value === null
    ? (Prisma.JsonNull as unknown as Prisma.InputJsonValue)
    : (value as Prisma.InputJsonValue);

type FeedAggregate = {
  articleCount: number;
  lastArticlePublishedAt: Date | null;
};

const defaultFeedAggregate: FeedAggregate = {
  articleCount: 0,
  lastArticlePublishedAt: null
};

const FEED_VALIDATION_TIMEOUT_MS = 8_000;

type BulkImportResult = {
  index: number;
  name: string;
  url: string;
  status: "success" | "failure" | "skipped";
  reason?: string;
  feed?: FeedResponse | null;
  validation?: {
    isValid: boolean;
    statusCode?: number | null;
    error?: string;
  };
};

export async function registerFeedRoutes(app: FastifyInstance) {
  app.get(
    "/feeds",
    {
      preHandler: app.verifyAdmin
    },
    async () => {
      const feeds = await app.db.feed.findMany({
        orderBy: { name: "asc" }
      });

      const feedIds = feeds.map((feed) => feed.id);
      const groupedStats =
        feedIds.length > 0
          ? await app.db.article.groupBy({
              by: ["feedId"],
              where: {
                feedId: { in: feedIds }
              },
              _count: { _all: true },
              _max: { publishedAt: true }
            })
          : [];

      const statsMap = new Map<string, FeedAggregate>();
      for (const stat of groupedStats) {
        statsMap.set(stat.feedId, {
          articleCount: stat._count._all,
          lastArticlePublishedAt: stat._max.publishedAt ?? null
        });
      }

      return feeds.map((feed) =>
        serializeFeed(feed, statsMap.get(feed.id) ?? defaultFeedAggregate)
      );
    }
  );

  app.post(
    "/feeds",
    {
      preHandler: app.verifyAdmin
    },
    async (request, reply) => {
      const payload = createFeedSchema.parse(request.body);

      const feed = await app.db.feed.create({
        data: {
          name: payload.name,
          url: payload.url,
          category: payload.category ?? null,
          tags: toJsonValue(payload.tags ?? []),
          fetchIntervalMinutes: payload.fetchIntervalMinutes ?? 30,
          metadata: toJsonValue(payload.metadata ?? {}),
          isActive: payload.isActive ?? true
        }
      });

      const response = await fetchFeedWithStats(app, feed.id);

      if (!response) {
        reply.code(500).send({
          error: "FeedCreationFailed",
          message: "Failed to load feed after creation"
        });
        return reply;
      }

      reply.code(201);
      return response;
    }
  );

  app.post(
    "/feeds/import",
    {
      preHandler: app.verifyAdmin
    },
    async (request, reply) => {
      const feeds = bulkImportFeedsSchema.parse(request.body);

      const results: BulkImportResult[] = [];

      for (const [index, feedInput] of feeds.entries()) {
        const baseResult: Omit<BulkImportResult, "status"> = {
          index,
          name: feedInput.name,
          url: feedInput.url
        };

        const existingFeed = await app.db.feed.findUnique({
          where: { url: feedInput.url }
        });

        if (existingFeed) {
          const feedWithStats = await fetchFeedWithStats(app, existingFeed.id);
          results.push({
            ...baseResult,
            status: "skipped",
            reason: "Feed already exists",
            feed: feedWithStats
          });
          continue;
        }

        const validation = await validateFeedUrl(feedInput.url);
        if (!validation.isValid) {
          results.push({
            ...baseResult,
            status: "failure",
            reason: validation.error ?? "Feed URL validation failed",
            validation: {
              isValid: false,
              statusCode: validation.statusCode ?? null,
              error: validation.error
            }
          });
          continue;
        }

        try {
          const created = await app.db.feed.create({
            data: mapFeedInputToCreateData(feedInput)
          });

          const feedWithStats = await fetchFeedWithStats(app, created.id);

          results.push({
            ...baseResult,
            status: "success",
            feed: feedWithStats,
            validation: {
              isValid: true,
              statusCode: validation.statusCode ?? null
            }
          });
        } catch (error) {
          const reason =
            error instanceof Error ? error.message : "Unknown error occurred";

          results.push({
            ...baseResult,
            status: "failure",
            reason,
            validation: {
              isValid: true,
              statusCode: validation.statusCode ?? null
            }
          });
        }
      }

      const summary = {
        total: results.length,
        succeeded: results.filter((item) => item.status === "success").length,
        failed: results.filter((item) => item.status === "failure").length,
        skipped: results.filter((item) => item.status === "skipped").length
      };

      const overallStatus =
        summary.failed === 0
          ? "success"
          : summary.succeeded === 0
            ? "failure"
            : "partial_success";

      await app.db.fetchLog.create({
        data: {
          feedId: null,
          operation: "feed_import",
          status: summary.failed > 0 ? FetchStatus.failure : FetchStatus.success,
          metrics: toJsonValue(summary),
          context: toJsonValue({
            results: results.map((item) => ({
              name: item.name,
              url: item.url,
              status: item.status,
              reason: item.reason ?? null,
              feedId: item.feed?.id ?? null,
              validation: item.validation ?? null
            })),
            summary: {
              ...summary,
              overallStatus
            }
          })
        }
      });

      reply.code(200);

      return {
        summary: {
          ...summary,
          overallStatus
        },
        results
      };
    }
  );

  app.patch(
    "/feeds/:id",
    {
      preHandler: app.verifyAdmin
    },
    async (request, reply) => {
      const params = feedIdSchema.parse(request.params);
      const payload = updateFeedSchema.parse(request.body);

      const data: Prisma.FeedUpdateInput = {};

      if (payload.name !== undefined) data.name = payload.name;
      if (payload.url !== undefined) data.url = payload.url;
      if (payload.category !== undefined) data.category = payload.category;
      if (payload.tags !== undefined) {
        data.tags = toJsonValue(payload.tags);
      }
      if (payload.fetchIntervalMinutes !== undefined) {
        data.fetchIntervalMinutes = payload.fetchIntervalMinutes;
      }
      if (payload.metadata !== undefined) {
        data.metadata = toJsonValue(payload.metadata ?? {});
      }
      if (payload.isActive !== undefined) data.isActive = payload.isActive;

      try {
        const updated = await app.db.feed.update({
          where: { id: params.id },
          data
        });

        const response = await fetchFeedWithStats(app, updated.id);

        if (!response) {
          reply.code(500).send({
            error: "FeedUpdateFailed",
            message: `Failed to load feed ${params.id} after update`
          });
          return reply;
        }

        return response;
      } catch (error) {
        if (isNotFoundError(error)) {
          reply.code(404).send({
            error: "NotFound",
            message: `Feed ${params.id} not found`
          });
          return reply;
        }

        throw error;
      }
    }
  );

  app.delete(
    "/feeds/:id",
    {
      preHandler: app.verifyAdmin
    },
    async (request, reply) => {
      const params = feedIdSchema.parse(request.params);

      try {
        await app.db.feed.delete({
          where: { id: params.id }
        });

        reply.code(204);
        return reply;
      } catch (error) {
        if (isNotFoundError(error)) {
          reply.code(404).send({
            error: "NotFound",
            message: `Feed ${params.id} not found`
          });
          return reply;
        }

        throw error;
      }
    }
  );

  app.get(
    "/feeds/:id/stats",
    {
      preHandler: app.verifyAdmin
    },
    async (request, reply) => {
      const params = feedIdSchema.parse(request.params);

      const feed = await app.db.feed.findUnique({
        where: { id: params.id },
        select: { id: true, name: true }
      });

      if (!feed) {
        reply.code(404).send({
          error: "NotFound",
          message: `Feed ${params.id} not found`
        });
        return reply;
      }

      const now = new Date();
      const since24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [aggregate, enrichmentCounts, recentFetches, last24Hours] =
        await Promise.all([
          app.db.article.aggregate({
            where: { feedId: params.id },
            _count: { _all: true },
            _max: { publishedAt: true }
          }),
          app.db.articleMetadata.groupBy({
            by: ["enrichmentStatus"],
            where: {
              article: {
                feedId: params.id
              }
            },
            _count: { _all: true }
          }),
          app.db.fetchLog.findMany({
            where: { feedId: params.id },
            orderBy: { startedAt: "desc" },
            take: 10
          }),
          app.db.article.count({
            where: {
              feedId: params.id,
              fetchedAt: {
                gte: since24Hours
              }
            }
          })
        ]);

      const enrichmentSummary = enrichmentCounts.reduce(
        (acc, item) => {
          acc[item.enrichmentStatus] = item._count._all;
          return acc;
        },
        {
          pending: 0,
          processing: 0,
          success: 0,
          failed: 0
        } as Record<string, number>
      );

      const successCount = recentFetches.filter(
        (log) => log.status === "success"
      ).length;
      const successRate =
        recentFetches.length === 0
          ? 100
          : Math.round((successCount / recentFetches.length) * 100);

      const lastFailure = recentFetches.find(
        (log) => log.status === "failure"
      );

      return {
        feedId: feed.id,
        feedName: feed.name,
        articles: {
          total: aggregate._count?._all ?? 0,
          last24Hours
        },
        enrichment: {
          pending: enrichmentSummary.pending ?? 0,
          processing: enrichmentSummary.processing ?? 0,
          success: enrichmentSummary.success ?? 0,
          failed: enrichmentSummary.failed ?? 0
        },
        fetches: {
          successRate,
          lastFailure: lastFailure
            ? {
                startedAt: lastFailure.startedAt.toISOString(),
                finishedAt: lastFailure.finishedAt
                  ? lastFailure.finishedAt.toISOString()
                  : null,
                errorMessage: lastFailure.errorMessage
              }
            : null,
          recent: recentFetches.map((log) => ({
            id: log.id,
            status: log.status,
            startedAt: log.startedAt.toISOString(),
            finishedAt: log.finishedAt ? log.finishedAt.toISOString() : null,
            errorMessage: log.errorMessage,
            metrics: ensureRecord(log.metrics)
          }))
        }
      };
    }
  );

  app.post(
    "/feeds/:id/ingest",
    {
      preHandler: app.verifyAdmin
    },
    async (request, reply) => {
      const params = feedIdSchema.parse(request.params);

      const feed = await app.db.feed.findUnique({
        where: { id: params.id },
        select: { id: true, fetchIntervalMinutes: true }
      });

      if (!feed) {
        reply.code(404).send({
          error: "NotFound",
          message: `Feed ${params.id} not found`
        });
        return;
      }

      const intervalMs = feed.fetchIntervalMinutes * 60_000;
      const dueAt = new Date(Date.now() - intervalMs - 1);

      await app.db.feed.update({
        where: { id: params.id },
        data: {
          lastFetchAt: dueAt
        }
      });

      reply.code(202).send({ status: "scheduled" });
    }
  );
}

async function fetchFeedWithStats(
  app: FastifyInstance,
  feedId: string
): Promise<FeedResponse | null> {
  const feed = await app.db.feed.findUnique({
    where: { id: feedId }
  });

  if (!feed) {
    return null;
  }

  const aggregate = await app.db.article.aggregate({
    where: { feedId },
    _count: { _all: true },
    _max: { publishedAt: true }
  });

  return serializeFeed(feed, {
    articleCount: aggregate._count?._all ?? 0,
    lastArticlePublishedAt: aggregate._max?.publishedAt ?? null
  });
}

function mapFeedInputToCreateData(
  input: BulkImportFeedInput
): Prisma.FeedCreateInput {
  return {
    name: input.name,
    url: input.url,
    category: input.category ?? null,
    tags: toJsonValue(input.tags ?? []),
    fetchIntervalMinutes: input.fetchIntervalMinutes ?? 30,
    metadata: toJsonValue(input.metadata ?? {}),
    isActive: input.isActive ?? true
  };
}

async function validateFeedUrl(
  url: string
): Promise<{
  isValid: boolean;
  statusCode?: number;
  error?: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEED_VALIDATION_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "user-agent":
          "news-api-bulk-importer/0.1 (+https://github.com/sahilmehta/news-api)",
        accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8"
      }
    });

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});

      return {
        isValid: false,
        statusCode: response.status,
        error: `HTTP ${response.status} ${response.statusText}`.trim()
      };
    }

    await response.body?.cancel().catch(() => {});

    return {
      isValid: true,
      statusCode: response.status
    };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  } finally {
    clearTimeout(timeout);
  }
}

function serializeFeed(
  feed: NonNullable<
    Awaited<ReturnType<FastifyInstance["db"]["feed"]["findUnique"]>>
  >,
  stats: FeedAggregate
): FeedResponse {
  return feedResponseSchema.parse({
    id: feed.id,
    name: feed.name,
    url: feed.url,
    category: feed.category ?? null,
    tags: ensureStringArray(feed.tags),
    isActive: feed.isActive,
    fetchIntervalMinutes: feed.fetchIntervalMinutes,
    lastFetchStatus: feed.lastFetchStatus ?? null,
    lastFetchAt: feed.lastFetchAt ? feed.lastFetchAt.toISOString() : null,
    metadata: ensureRecord(feed.metadata),
    createdAt: feed.createdAt.toISOString(),
    updatedAt: feed.updatedAt.toISOString(),
    stats: {
      articleCount: stats.articleCount,
      lastArticlePublishedAt: stats.lastArticlePublishedAt
        ? stats.lastArticlePublishedAt.toISOString()
        : null
    }
  });
}

function ensureStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return [];
}

function ensureRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  );
}

