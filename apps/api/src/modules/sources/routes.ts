import type { FastifyInstance } from "fastify";
import { Prisma } from "@news-api/db";

import {
  sourceListQuerySchema,
  sourceListResponseSchema,
  sourceResponseSchema,
  type SourceListQuery,
  type SourceResponse,
  type SourceSortField
} from "./schemas.js";

type SourceStats = {
  feedCount: number;
  activeFeedCount: number;
};

const defaultSourceStats: SourceStats = {
  feedCount: 0,
  activeFeedCount: 0
};

type SourceCursorPayload = {
  id: string | null;
  sort: SourceListQuery["sort"];
  order: SourceListQuery["order"];
};

export async function registerSourceRoutes(app: FastifyInstance) {
  app.get(
    "/sources",
    {
      preHandler: app.verifyAdmin
    },
    async (request) => {
      const query = sourceListQuerySchema.parse(request.query);
      const filters = buildSourceFilters(query);
      const cursorId = decodeCursor(query.cursor, query.sort, query.order);
      const orderBy = buildSourceOrder(query.sort, query.order);

      const sources = await app.db.source.findMany({
        where: filters,
        orderBy,
        cursor: cursorId ? { id: cursorId } : undefined,
        skip: cursorId ? 1 : 0,
        take: query.limit + 1
      });

      const hasNextPage = sources.length > query.limit;
      const trimmed = hasNextPage ? sources.slice(0, query.limit) : sources;

      const sourceIds = trimmed.map((source) => source.id);

      const feedStats = sourceIds.length
        ? await fetchFeedStats(app, sourceIds)
        : new Map<string, SourceStats>();

      const serialized = trimmed.map((source) =>
        serializeSource(source, feedStats.get(source.id) ?? defaultSourceStats)
      );

      const nextCursor = hasNextPage
        ? encodeCursor({
            id: sources[query.limit]?.id ?? null,
            sort: query.sort,
            order: query.order
          })
        : null;

      const total = await app.db.source.count({ where: filters });

      return sourceListResponseSchema.parse({
        data: serialized,
        pagination: {
          limit: query.limit,
          nextCursor,
          hasNextPage,
          total
        }
      });
    }
  );

  app.get(
    "/sources/:id/feeds",
    {
      preHandler: app.verifyAdmin
    },
    async (request, reply) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const query = z
        .object({
          limit: z.coerce.number().int().min(1).max(100).default(50),
          cursor: z.string().optional()
        })
        .parse(request.query);

      const source = await app.db.source.findUnique({
        where: { id: params.id },
        select: { id: true }
      });

      if (!source) {
        reply.code(404).send({
          error: "NotFound",
          message: `Source ${params.id} not found`
        });
        return;
      }

      const feeds = await app.db.feed.findMany({
        where: {
          sourceId: params.id
        },
        orderBy: [
          { isActive: "desc" },
          { name: "asc" }
        ],
        take: query.limit + 1,
        select: {
          id: true,
          name: true,
          url: true,
          category: true,
          isActive: true,
          lastFetchStatus: true,
          lastFetchAt: true
        }
      });

      const hasNextPage = feeds.length > query.limit;
      const trimmed = hasNextPage ? feeds.slice(0, query.limit) : feeds;

      return {
        data: trimmed.map((feed) => ({
          id: feed.id,
          name: feed.name,
          url: feed.url,
          category: feed.category,
          isActive: feed.isActive,
          lastFetchStatus: feed.lastFetchStatus,
          lastFetchAt: feed.lastFetchAt?.toISOString() ?? null
        })),
        pagination: {
          limit: query.limit,
          hasNextPage,
          total: trimmed.length
        }
      };
    }
  );
}

function buildSourceFilters(query: SourceListQuery): Prisma.SourceWhereInput {
  const filters: Prisma.SourceWhereInput[] = [];

  if (query.q) {
    filters.push({
      baseUrl: {
        contains: query.q,
        mode: "insensitive"
      }
    });
  }

  if (query.hasFeeds !== undefined) {
    filters.push({
      feeds: query.hasFeeds
        ? {
            some: {}
          }
        : {
            none: {}
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

function buildSourceOrder(
  sort: SourceSortField | undefined,
  order: "asc" | "desc"
): Prisma.SourceOrderByWithRelationInput[] {
  const { column, direction } = resolveColumn(sort ?? "createdAt", order);
  return [column, { id: direction }];
}

function resolveColumn(
  sort: SourceSortField,
  order: "asc" | "desc"
): {
  column: Prisma.SourceOrderByWithRelationInput;
  direction: "asc" | "desc";
} {
  switch (sort) {
    case "baseUrl":
      return {
        column: { baseUrl: order },
        direction: order
      };
    case "updatedAt":
      return {
        column: { updatedAt: order },
        direction: order
      };
    case "createdAt":
    default:
      return {
        column: { createdAt: order },
        direction: order
      };
  }
}

async function fetchFeedStats(
  app: FastifyInstance,
  sourceIds: string[]
): Promise<Map<string, SourceStats>> {
  const feeds = await app.db.feed.findMany({
    where: {
      sourceId: {
        in: sourceIds
      }
    },
    select: {
      sourceId: true,
      isActive: true
    }
  });

  const stats = new Map<string, SourceStats>();

  for (const feed of feeds) {
    if (!feed.sourceId) continue;

    const current = stats.get(feed.sourceId) ?? {
      feedCount: 0,
      activeFeedCount: 0
    };

    current.feedCount += 1;
    if (feed.isActive) {
      current.activeFeedCount += 1;
    }

    stats.set(feed.sourceId, current);
  }

  return stats;
}

function serializeSource(source: Prisma.SourceGetPayload<{}>, stats: SourceStats): SourceResponse {
  return sourceResponseSchema.parse({
    id: source.id,
    baseUrl: source.baseUrl,
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
    stats: {
      feedCount: stats.feedCount,
      activeFeedCount: stats.activeFeedCount
    }
  });
}

function encodeCursor(payload: SourceCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(
  cursor: string | undefined,
  sort: SourceListQuery["sort"],
  order: SourceListQuery["order"]
): string | null {
  if (!cursor) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    ) as SourceCursorPayload;

    if (decoded.sort !== sort || decoded.order !== order) {
      return null;
    }

    return decoded.id;
  } catch {
    return null;
  }
}

