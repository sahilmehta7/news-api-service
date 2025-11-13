import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";

import { logsQuerySchema } from "./schemas.js";

export async function registerLogRoutes(app: FastifyInstance) {
  app.get(
    "/logs",
    {
      preHandler: app.verifyAdmin
    },
    async (request) => {
      const query = logsQuerySchema.parse(request.query);

      const where: Prisma.FetchLogWhereInput = {};

      if (query.feedId) {
        where.feedId = query.feedId;
      }

      if (query.status) {
        where.status = query.status;
      }

      if (query.operation) {
        where.operation = query.operation;
      }

      if (query.search) {
        where.OR = [
          {
            errorMessage: {
              contains: query.search,
              mode: "insensitive"
            }
          },
          {
            feed: {
              name: {
                contains: query.search,
                mode: "insensitive"
              }
            }
          }
        ];
      }

      const skip = (query.page - 1) * query.pageSize;

      const [logs, total] = await Promise.all([
        app.db.fetchLog.findMany({
          where,
          orderBy: {
            startedAt: "desc"
          },
          skip,
          take: query.pageSize,
          include: {
            feed: {
              select: {
                name: true
              }
            }
          }
        }),
        app.db.fetchLog.count({ where })
      ]);

      return {
        data: logs.map((log) => ({
          id: log.id,
          feedId: log.feedId ?? null,
          feedName: log.feed?.name ?? null,
          operation: log.operation,
          status: log.status,
          startedAt: log.startedAt.toISOString(),
          finishedAt: log.finishedAt ? log.finishedAt.toISOString() : null,
          durationMs: log.finishedAt
            ? log.finishedAt.getTime() - log.startedAt.getTime()
            : null,
          errorMessage: log.errorMessage,
          errorStack: log.errorStack,
          metrics: ensureRecord(log.metrics),
          context: ensureRecord(log.context)
        })),
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          hasNextPage: skip + logs.length < total
        }
      };
    }
  );
}

function ensureRecord(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

