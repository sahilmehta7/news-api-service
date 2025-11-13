import Fastify from "fastify";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { registerFeedRoutes } from "../../apps/api/src/modules/feeds/routes.js";

describe("bulk feed import endpoint", () => {
  const storedFeedsByUrl = new Map<string, any>();
  const storedFeedsById = new Map<string, any>();
  const now = new Date("2024-01-01T00:00:00.000Z");

  beforeEach(() => {
    storedFeedsByUrl.clear();
    storedFeedsById.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("imports feeds, skips failures, and records a summary log", async () => {
    const app = Fastify();
    (app as any).verifyAdmin = async () => {};

    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("valid.test")) {
        return new Response("", { status: 200 });
      }
      throw new Error("Network error");
    });
    vi.stubGlobal("fetch", fetchMock);

    const feedFindUnique = vi.fn().mockImplementation(async ({ where }: any) => {
      if (where.url) {
        return storedFeedsByUrl.get(where.url) ?? null;
      }
      if (where.id) {
        return storedFeedsById.get(where.id) ?? null;
      }
      return null;
    });

    const feedCreate = vi.fn().mockImplementation(async ({ data }: any) => {
      const createdFeed = {
        id: "feed-valid-id",
        name: data.name,
        url: data.url,
        category: data.category ?? null,
        tags: data.tags ?? [],
        isActive: data.isActive ?? true,
        fetchIntervalMinutes: data.fetchIntervalMinutes ?? 30,
        lastFetchStatus: "idle",
        lastFetchAt: null,
        metadata: data.metadata ?? {},
        createdAt: now,
        updatedAt: now
      };
      storedFeedsByUrl.set(createdFeed.url, createdFeed);
      storedFeedsById.set(createdFeed.id, createdFeed);
      return createdFeed;
    });

    const articleAggregate = vi.fn().mockResolvedValue({
      _count: { _all: 0 },
      _max: { publishedAt: null }
    });

    const fetchLogCreate = vi.fn().mockResolvedValue({});

    (app as any).db = {
      feed: {
        findUnique: feedFindUnique,
        create: feedCreate
      },
      article: {
        aggregate: articleAggregate
      },
      fetchLog: {
        create: fetchLogCreate
      }
    };

    await registerFeedRoutes(app as any);

    const response = await app.inject({
      method: "POST",
      url: "/feeds/import",
      payload: {
        feeds: [
          { name: "Valid Feed", url: "https://valid.test/rss.xml" },
          { name: "Broken Feed", url: "https://broken.test/rss.xml" }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();

    expect(payload.summary).toEqual({
      total: 2,
      succeeded: 1,
      failed: 1,
      skipped: 0,
      overallStatus: "partial_success"
    });

    expect(payload.results).toHaveLength(2);
    expect(payload.results[0]).toMatchObject({
      name: "Valid Feed",
      status: "success"
    });
    expect(payload.results[1]).toMatchObject({
      name: "Broken Feed",
      status: "failure"
    });

    expect(fetchLogCreate).toHaveBeenCalledTimes(1);
    const logPayload = fetchLogCreate.mock.calls[0]?.[0]?.data;
    expect(logPayload).toMatchObject({
      operation: "feed_import",
      status: "failure",
      metrics: {
        total: 2,
        succeeded: 1,
        failed: 1,
        skipped: 0
      }
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    await app.close();
  });
});

