import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerFeedRoutes } from "../../apps/api/src/modules/feeds/routes.js";

describe("feeds list endpoint", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();
    (app as any).verifyAdmin = async () => {};
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it("returns feeds with pagination metadata and summary counters", async () => {
    const now = new Date("2024-01-01T00:00:00.000Z");
    const feeds = [
      {
        id: "feed-1",
        name: "Tech Daily",
        url: "https://tech.example.com/rss",
        category: "technology",
        tags: ["ai", "cloud"],
        isActive: true,
        fetchIntervalMinutes: 30,
        lastFetchStatus: "warning",
        lastFetchAt: now,
        metadata: {},
        createdAt: now,
        updatedAt: now
      },
      {
        id: "feed-2",
        name: "Finance Weekly",
        url: "https://finance.example.com/rss",
        category: "finance",
        tags: ["markets"],
        isActive: false,
        fetchIntervalMinutes: 60,
        lastFetchStatus: "success",
        lastFetchAt: now,
        metadata: {},
        createdAt: now,
        updatedAt: now
      }
    ];

    const feedFindMany = vi
      .fn()
      .mockResolvedValueOnce(feeds) // initial page
      .mockResolvedValueOnce(feeds); // facet sources

    const feedCount = vi.fn().mockImplementation(async ({ where }: any = {}) => {
      if (!where || Object.keys(where).length === 0) {
        return feeds.length;
      }
      if (where.isActive === true) return 1;
      if (where.isActive === false) return 1;
      if (where.lastFetchStatus?.in) return 1;
      return 0;
    });

    const articleGroupBy = vi.fn().mockResolvedValue([
      {
        feedId: "feed-1",
        _count: { _all: 5 },
        _max: { publishedAt: now }
      }
    ]);

    const articleCount = vi.fn().mockResolvedValue(15);

    (app as any).db = {
      feed: {
        findMany: feedFindMany,
        count: feedCount,
        findUnique: vi.fn().mockResolvedValue(feeds[0])
      },
      article: {
        groupBy: articleGroupBy,
        count: articleCount
      },
      fetchLog: {
        create: vi.fn()
      }
    };

    await registerFeedRoutes(app as any);

    const response = await app.inject({
      method: "GET",
      url: "/feeds?limit=1&sort=createdAt&order=desc"
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();

    expect(payload.data).toHaveLength(1);
    expect(payload.data[0]).toMatchObject({
      id: "feed-1",
      name: "Tech Daily",
      stats: {
        articleCount: 5
      }
    });

    expect(payload.pagination).toMatchObject({
      limit: 1,
      hasNextPage: true,
      total: 2
    });
    expect(typeof payload.pagination.nextCursor).toBe("string");

    expect(payload.summary).toEqual({
      totalFeeds: 2,
      activeFeeds: 1,
      inactiveFeeds: 1,
      issueFeeds: 1,
      totalArticles: 15
    });
    expect(payload.facets).toEqual({
      categories: ["finance", "technology"],
      tags: ["ai", "cloud", "markets"]
    });

    expect(feedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 2,
        skip: 0,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      })
    );
    expect(feedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          category: true,
          tags: true
        }
      })
    );
    expect(articleGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          feedId: { in: ["feed-1"] }
        })
      })
    );
  });

  it("applies query filters to feed search", async () => {
    const feedFindMany = vi.fn().mockResolvedValue([]);
    const feedCount = vi.fn().mockResolvedValue(0);
    const articleGroupBy = vi.fn().mockResolvedValue([]);
    const articleCount = vi.fn().mockResolvedValue(0);

    (app as any).db = {
      feed: {
        findMany: feedFindMany,
        count: feedCount,
        findUnique: vi.fn()
      },
      article: {
        groupBy: articleGroupBy,
        count: articleCount
      },
      fetchLog: {
        create: vi.fn()
      }
    };

    await registerFeedRoutes(app as any);

    await app.inject({
      method: "GET",
      url: "/feeds?q=tech&categories=finance&categories=technology&tags=ai&tags=ml&lastFetchStatuses=warning&isActive=true&hasIssues=false"
    });

    expect(feedFindMany).toHaveBeenCalledTimes(2);
    const callArgs = feedFindMany.mock.calls[0]?.[0] ?? {};
    expect(callArgs.where?.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              name: expect.objectContaining({ contains: "tech" })
            }),
            expect.objectContaining({
              url: expect.objectContaining({ contains: "tech" })
            })
          ])
        }),
        expect.objectContaining({
          category: { in: ["finance", "technology"] }
        }),
        expect.objectContaining({
          tags: { array_contains: ["ai", "ml"] }
        }),
        expect.objectContaining({
          lastFetchStatus: { in: ["warning"] }
        }),
        expect.objectContaining({
          isActive: true
        }),
        expect.objectContaining({
          NOT: expect.objectContaining({
            lastFetchStatus: { in: ["warning", "error"] }
          })
        })
      ])
    );
  });

  it("returns 404 when requesting articles for a missing feed", async () => {
    (app as any).db = {
      feed: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        findUnique: vi.fn().mockResolvedValue(null)
      },
      article: {
        groupBy: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0)
      },
      fetchLog: {
        create: vi.fn()
      }
    };

    await registerFeedRoutes(app as any);

    const response = await app.inject({
      method: "GET",
      url: "/feeds/5e0bb968-1083-4dfe-a0a7-58d462c2a613/articles"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: "NotFound"
    });
  });

  it("returns feed details including stats", async () => {
    const now = new Date("2024-01-01T00:00:00.000Z");
    const feed = {
      id: "feed-1",
      name: "Tech Daily",
      url: "https://tech.example.com/rss",
      category: "technology",
      tags: ["ai"],
      isActive: true,
      fetchIntervalMinutes: 30,
      lastFetchStatus: "success",
      lastFetchAt: now,
      metadata: {},
      createdAt: now,
      updatedAt: now
    };

    const feedFindUnique = vi
      .fn()
      .mockResolvedValueOnce(feed)
      .mockResolvedValueOnce(feed);

    const articleAggregate = vi.fn().mockResolvedValue({
      _count: { _all: 12 },
      _max: { publishedAt: now }
    });

    (app as any).db = {
      feed: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        findUnique: feedFindUnique
      },
      article: {
        groupBy: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        aggregate: articleAggregate
      },
      fetchLog: {
        create: vi.fn()
      }
    };

    await registerFeedRoutes(app as any);

    const response = await app.inject({
      method: "GET",
      url: "/feeds/feed-1"
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload).toMatchObject({
      id: "feed-1",
      name: "Tech Daily",
      stats: {
        articleCount: 12
      }
    });
    expect(articleAggregate).toHaveBeenCalledWith({
      where: { feedId: "feed-1" },
      _count: { _all: true },
      _max: { publishedAt: true }
    });
  });
});


