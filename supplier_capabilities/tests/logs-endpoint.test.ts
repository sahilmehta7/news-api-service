import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import { registerLogRoutes } from "../../apps/api/src/modules/logs/routes";

describe("logs endpoint", () => {
  it("returns normalized log entries with pagination metadata", async () => {
    const app = Fastify();
    (app as any).verifyAdmin = async () => {};

    const startedAt = new Date("2024-01-01T00:00:00Z");
    const finishedAt = new Date("2024-01-01T00:00:05Z");

    const findMany = vi.fn().mockResolvedValue([
      {
        id: "log-1",
        feedId: "feed-1",
        feed: { name: "Feed One" },
        status: "success",
        startedAt,
        finishedAt,
        errorMessage: null,
        errorStack: null,
        metrics: { itemsParsed: 10 },
        context: { job: "ingest" }
      }
    ]);

    const count = vi.fn().mockResolvedValue(1);

    (app as any).db = {
      fetchLog: {
        findMany,
        count
      }
    };

    await registerLogRoutes(app as any);

    const response = await app.inject({
      method: "GET",
      url: "/logs"
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();

    expect(findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { startedAt: "desc" },
      skip: 0,
      take: 25,
      include: { feed: { select: { name: true } } }
    });

    expect(payload).toEqual({
      data: [
        {
          id: "log-1",
          feedId: "feed-1",
          feedName: "Feed One",
          status: "success",
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationMs: 5000,
          errorMessage: null,
          errorStack: null,
          metrics: { itemsParsed: 10 },
          context: { job: "ingest" }
        }
      ],
      pagination: {
        page: 1,
        pageSize: 25,
        total: 1,
        hasNextPage: false
      }
    });

    await app.close();
  });
});

