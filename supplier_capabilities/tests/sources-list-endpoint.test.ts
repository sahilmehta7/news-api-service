import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerSourceRoutes } from "../../apps/api/src/modules/sources/routes.js";

describe("sources list endpoint", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();
    (app as any).verifyAdmin = async () => {};
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns sources with feed stats and pagination metadata", async () => {
    const now = new Date("2024-01-01T00:00:00.000Z");
    const sources = [
      {
        id: "source-1",
        baseUrl: "https://tech.example.com",
        createdAt: now,
        updatedAt: now
      },
      {
        id: "source-2",
        baseUrl: "https://finance.example.com",
        createdAt: now,
        updatedAt: now
      }
    ];

    const sourceFindMany = vi.fn().mockResolvedValue(sources);
    const sourceCount = vi.fn().mockResolvedValue(sources.length);
    const feedFindMany = vi.fn().mockResolvedValue([
      { sourceId: "source-1", isActive: true },
      { sourceId: "source-1", isActive: false },
      { sourceId: "source-2", isActive: true }
    ]);

    (app as any).db = {
      source: {
        findMany: sourceFindMany,
        count: sourceCount
      },
      feed: {
        findMany: feedFindMany
      }
    };

    await registerSourceRoutes(app as any);

    const response = await app.inject({
      method: "GET",
      url: "/sources"
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();

    expect(payload.data).toHaveLength(2);
    expect(payload.data[0]).toMatchObject({
      id: "source-1",
      baseUrl: "https://tech.example.com",
      stats: {
        feedCount: 2,
        activeFeedCount: 1
      }
    });
    expect(payload.data[1]).toMatchObject({
      id: "source-2",
      stats: {
        feedCount: 1,
        activeFeedCount: 1
      }
    });

    expect(payload.pagination).toEqual({
      limit: 20,
      nextCursor: null,
      hasNextPage: false,
      total: 2
    });

    expect(sourceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 21,
        skip: 0,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      })
    );
    expect(feedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sourceId: {
            in: ["source-1", "source-2"]
          }
        }
      })
    );
  });

  it("applies search filter on base URL", async () => {
    const sourceFindMany = vi.fn().mockResolvedValue([]);
    const sourceCount = vi.fn().mockResolvedValue(0);
    const feedFindMany = vi.fn().mockResolvedValue([]);

    (app as any).db = {
      source: {
        findMany: sourceFindMany,
        count: sourceCount
      },
      feed: {
        findMany: feedFindMany
      }
    };

    await registerSourceRoutes(app as any);

    await app.inject({
      method: "GET",
      url: "/sources?q=example"
    });

    const call = sourceFindMany.mock.calls[0]?.[0];
    expect(call?.where?.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          baseUrl: expect.objectContaining({
            contains: "example",
            mode: "insensitive"
          })
        })
      ])
    );
  });

  it("applies hasFeeds filter", async () => {
    const sourceFindMany = vi.fn().mockResolvedValue([]);
    const sourceCount = vi.fn().mockResolvedValue(0);
    const feedFindMany = vi.fn().mockResolvedValue([]);

    (app as any).db = {
      source: {
        findMany: sourceFindMany,
        count: sourceCount
      },
      feed: {
        findMany: feedFindMany
      }
    };

    await registerSourceRoutes(app as any);

    await app.inject({
      method: "GET",
      url: "/sources?hasFeeds=true"
    });

    const call = sourceFindMany.mock.calls[0]?.[0];
    expect(call?.where?.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feeds: expect.objectContaining({
            some: {}
          })
        })
      ])
    );

    await app.inject({
      method: "GET",
      url: "/sources?hasFeeds=false"
    });

    const call2 = sourceFindMany.mock.calls[1]?.[0];
    expect(call2?.where?.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feeds: expect.objectContaining({
            none: {}
          })
        })
      ])
    );
  });

  it("supports cursor pagination", async () => {
    const now = new Date("2024-01-01T00:00:00.000Z");
    const sources = Array.from({ length: 3 }).map((_, index) => ({
      id: `source-${index + 1}`,
      baseUrl: `https://example-${index + 1}.com`,
      createdAt: new Date(now.getTime() + index),
      updatedAt: new Date(now.getTime() + index)
    }));

    const firstPageFindMany = vi.fn().mockResolvedValue(sources);
    const secondPageFindMany = vi.fn().mockResolvedValue([sources[2]]);
    const sourceCount = vi.fn().mockResolvedValue(sources.length);
    const feedFindMany = vi.fn().mockResolvedValue([]);

    (app as any).db = {
      source: {
        findMany: firstPageFindMany,
        count: sourceCount
      },
      feed: {
        findMany: feedFindMany
      }
    };

    await registerSourceRoutes(app as any);

    const firstResponse = await app.inject({
      method: "GET",
      url: "/sources?limit=2&sort=baseUrl&order=asc"
    });

    expect(firstResponse.statusCode).toBe(200);
    const firstPayload = firstResponse.json();
    expect(firstPayload.data).toHaveLength(2);
    expect(firstPayload.pagination.hasNextPage).toBe(true);
    expect(typeof firstPayload.pagination.nextCursor).toBe("string");

    (app as any).db.source.findMany = secondPageFindMany;

    const secondResponse = await app.inject({
      method: "GET",
      url: `/sources?limit=2&sort=baseUrl&order=asc&cursor=${encodeURIComponent(
        firstPayload.pagination.nextCursor
      )}`
    });

    expect(secondResponse.statusCode).toBe(200);
    const secondPayload = secondResponse.json();
    expect(secondPayload.data).toHaveLength(1);
    expect(secondPayload.pagination.hasNextPage).toBe(false);

    expect(secondPageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: "source-3" },
        skip: 1,
        take: 3
      })
    );
  });
});

