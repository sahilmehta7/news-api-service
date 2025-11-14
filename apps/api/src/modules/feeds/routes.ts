import type { FastifyInstance } from "fastify";
import { Prisma, FetchStatus, FeedStatus } from "@news-api/db";

import {
  bulkImportFeedsSchema,
  createFeedSchema,
  feedIdSchema,
  feedListQuerySchema,
  feedListResponseSchema,
  type BulkImportFeedInput,
  type FeedListQuery,
  type FeedResponse,
  feedResponseSchema,
  updateFeedSchema
} from "./schemas.js";
import { articleListQuerySchema } from "../articles/schemas.js";
import { listArticles } from "../articles/service.js";

const toJsonValue = (value: unknown): Prisma.InputJsonValue =>
  value === null
    ? (Prisma.JsonNull as unknown as Prisma.InputJsonValue)
    : (value as Prisma.InputJsonValue);

const ISSUE_FEED_STATUSES: FeedStatus[] = [FeedStatus.warning, FeedStatus.error];

type FeedAggregate = {
  articleCount: number;
  lastArticlePublishedAt: Date | null;
};

type FeedWithSource = Prisma.FeedGetPayload<{
  include: {
    source: true;
  };
}>;

const defaultFeedAggregate: FeedAggregate = {
  articleCount: 0,
  lastArticlePublishedAt: null
};

const FEED_VALIDATION_TIMEOUT_MS = 8_000;

type FeedCursorPayload = {
  id: string | null;
  sort: FeedListQuery["sort"];
  order: FeedListQuery["order"];
};

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
    async (request) => {
      const query = feedListQuerySchema.parse(request.query);
      const filters = buildFeedFilters(query);
      const cursorId = decodeCursor(query.cursor, query.sort, query.order);

      const orderBy = buildFeedOrder(query.sort, query.order);

      const feedsPromise = app.db.feed.findMany({
        where: filters,
        orderBy,
        cursor: cursorId ? { id: cursorId } : undefined,
        skip: cursorId ? 1 : 0,
        take: query.limit + 1,
        include: {
          source: true
        }
      });
      const facetSourcesPromise = app.db.feed.findMany({
        where: filters,
        select: {
          category: true,
          tags: true
        }
      });

      const [feeds, facetSources] = await Promise.all([
        feedsPromise,
        facetSourcesPromise
      ]);

      const feedIds = feeds.slice(0, query.limit).map((feed) => feed.id);
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

      const hasNextPage = feeds.length > query.limit;
      const trimmed = hasNextPage ? feeds.slice(0, query.limit) : feeds;
      const nextCursor = hasNextPage
        ? encodeCursor({
            id: feeds[query.limit]?.id ?? null,
            sort: query.sort,
            order: query.order
          })
        : null;

      const serialized = trimmed.map((feed) =>
        serializeFeed(feed, statsMap.get(feed.id) ?? defaultFeedAggregate)
      );

      const categories = Array.from(
        new Set(
          facetSources
            .map((feed) => feed.category?.trim())
            .filter((category): category is string => Boolean(category && category.length > 0))
        )
      ).sort((a, b) => a.localeCompare(b));

      const tags = Array.from(
        new Set(
          facetSources.flatMap((feed) =>
            ensureStringArray(feed.tags)
              .map((tag) => tag.trim())
              .filter((tag) => tag.length > 0)
          )
        )
      ).sort((a, b) => a.localeCompare(b));

      const [totalFeeds, activeFeeds, inactiveFeeds, issueFeeds, totalArticles] =
        await Promise.all([
          app.db.feed.count({ where: filters }),
          app.db.feed.count({
            where: mergeWhere(filters, { isActive: true })
          }),
          app.db.feed.count({
            where: mergeWhere(filters, { isActive: false })
          }),
          app.db.feed.count({
            where: mergeWhere(filters, {
              lastFetchStatus: { in: ISSUE_FEED_STATUSES }
            })
          }),
          app.db.article.count({
            where: isWhereEmpty(filters) ? {} : { feed: { is: filters } }
          })
        ]);

      return feedListResponseSchema.parse({
        data: serialized,
        pagination: {
          limit: query.limit,
          nextCursor,
          hasNextPage,
          total: totalFeeds
        },
        summary: {
          totalFeeds,
          activeFeeds,
          inactiveFeeds,
          issueFeeds,
          totalArticles
        },
        facets: {
          categories,
          tags
        }
      });
    }
  );

  app.post(
    "/feeds",
    {
      preHandler: app.verifyAdmin
    },
    async (request, reply) => {
      const payload = createFeedSchema.parse(request.body);

      const createData = await mapFeedInputToCreateData(app, payload);

      const feed = await app.db.feed.create({
        data: createData
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
          const createData = await mapFeedInputToCreateData(app, feedInput);
          const created = await app.db.feed.create({
            data: createData
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
      if (payload.url !== undefined) {
        data.url = payload.url;
        const source = await ensureSource(app, payload.url);
        data.source = {
          connect: {
            id: source.id
          }
        };
      }
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
        // Soft delete: set isActive to false instead of actually deleting
        // This prevents cascade deletion of all articles, which can be very slow
        const feed = await app.db.feed.update({
          where: { id: params.id },
          data: { isActive: false }
        });

        const response = await fetchFeedWithStats(app, feed.id);

        if (!response) {
          reply.code(404).send({
            error: "NotFound",
            message: `Feed ${params.id} not found`
          });
          return reply;
        }

        reply.code(200);
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

  app.get(
    "/feeds/:id",
    {
      preHandler: app.verifyAdmin
    },
    async (request, reply) => {
      const params = feedIdSchema.parse(request.params);
      const feed = await fetchFeedWithStats(app, params.id);

      if (!feed) {
        reply.code(404).send({
          error: "NotFound",
          message: `Feed ${params.id} not found`
        });
        return reply;
      }

      return feedResponseSchema.parse(feed);
    }
  );

  app.get(
    "/feeds/:id/articles",
    {
      preHandler: app.verifyAdmin
    },
    async (request, reply) => {
      const params = feedIdSchema.parse(request.params);

      const feed = await app.db.feed.findUnique({
        where: { id: params.id },
        select: { id: true }
      });

      if (!feed) {
        reply.code(404).send({
          error: "NotFound",
          message: `Feed ${params.id} not found`
        });
        return reply;
      }

      const baseQuery = articleListQuerySchema.parse(request.query);
      const response = await listArticles(app, {
        ...baseQuery,
        feedId: params.id
      });

      return response;
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

function buildFeedFilters(query: FeedListQuery): Prisma.FeedWhereInput {
  const filters: Prisma.FeedWhereInput[] = [];

  if (query.q) {
    filters.push({
      OR: [
        {
          name: {
            contains: query.q,
            mode: "insensitive"
          }
        },
        {
          url: {
            contains: query.q,
            mode: "insensitive"
          }
        }
      ]
    });
  }

  if (query.categories && query.categories.length > 0) {
    filters.push({
      category: {
        in: query.categories
      }
    });
  }

  if (query.tags && query.tags.length > 0) {
    filters.push({
      tags: {
        array_contains: query.tags
      }
    });
  }

  if (query.lastFetchStatuses && query.lastFetchStatuses.length > 0) {
    filters.push({
      lastFetchStatus: {
        in: query.lastFetchStatuses as FeedStatus[]
      }
    });
  }

  if (typeof query.isActive === "boolean") {
    filters.push({
      isActive: query.isActive
    });
  }

  if (query.hasIssues === true) {
    filters.push({
      lastFetchStatus: {
        in: ISSUE_FEED_STATUSES
      }
    });
  } else if (query.hasIssues === false) {
    filters.push({
      NOT: {
        lastFetchStatus: {
          in: ISSUE_FEED_STATUSES
        }
      }
    });
  }

  if (filters.length === 0) {
    return {};
  }

  return {
    AND: filters
  };
}

function buildFeedOrder(
  sort: FeedListQuery["sort"],
  order: FeedListQuery["order"]
): Prisma.FeedOrderByWithRelationInput[] {
  const direction = order === "asc" ? "asc" : "desc";

  if (sort === "name") {
    return [{ name: direction }, { id: direction }];
  }

  if (sort === "lastFetchAt") {
    return [{ lastFetchAt: direction }, { id: direction }];
  }

  if (sort === "articleCount") {
    return [{ articles: { _count: direction } }, { id: direction }];
  }

  return [{ createdAt: direction }, { id: direction }];
}

function encodeCursor(payload: FeedCursorPayload): string | null {
  if (!payload.id) {
    return null;
  }

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(
  cursor: string | undefined,
  expectedSort: FeedListQuery["sort"],
  expectedOrder: FeedListQuery["order"]
): string | null {
  if (!cursor) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    ) as FeedCursorPayload;

    if (
      !decoded ||
      typeof decoded.id !== "string" ||
      decoded.sort !== expectedSort ||
      decoded.order !== expectedOrder
    ) {
      return null;
    }

    return decoded.id;
  } catch {
    return null;
  }
}

function mergeWhere(
  base: Prisma.FeedWhereInput,
  extra: Prisma.FeedWhereInput
): Prisma.FeedWhereInput {
  if (isWhereEmpty(base)) {
    return extra;
  }

  if (isWhereEmpty(extra)) {
    return base;
  }

  return {
    AND: [base, extra]
  };
}

function isWhereEmpty(where: Prisma.FeedWhereInput | undefined): boolean {
  if (!where) {
    return true;
  }

  return Object.keys(where).length === 0;
}

async function fetchFeedWithStats(
  app: FastifyInstance,
  feedId: string
): Promise<FeedResponse | null> {
  const feed = await app.db.feed.findUnique({
    where: { id: feedId },
    include: {
      source: true
    }
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

function extractBaseUrl(url: string): string {
  try {
    return new URL(url).origin;
  } catch (error) {
    throw new Error(
      `Invalid feed URL "${url}": ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function ensureSource(app: FastifyInstance, url: string) {
  const baseUrl = extractBaseUrl(url);

  return app.db.source.upsert({
    where: { baseUrl },
    update: {},
    create: { baseUrl }
  });
}

async function mapFeedInputToCreateData(
  app: FastifyInstance,
  input: BulkImportFeedInput
): Promise<Prisma.FeedCreateInput> {
  const source = await ensureSource(app, input.url);

  return {
    name: input.name,
    url: input.url,
    category: input.category ?? null,
    tags: toJsonValue(input.tags ?? []),
    fetchIntervalMinutes: input.fetchIntervalMinutes ?? 30,
    metadata: toJsonValue(input.metadata ?? {}),
    isActive: input.isActive ?? true,
    source: {
      connect: {
        id: source.id
      }
    }
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
  feed: FeedWithSource,
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
    source: feed.source
      ? {
          id: feed.source.id,
          baseUrl: feed.source.baseUrl,
          createdAt: feed.source.createdAt.toISOString(),
          updatedAt: feed.source.updatedAt.toISOString()
        }
      : null,
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

