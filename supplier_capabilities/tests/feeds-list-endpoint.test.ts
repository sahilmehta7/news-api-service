import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerFeedRoutes } from "../../apps/api/src/modules/feeds/routes.js";

const FEED_ID = "11111111-1111-1111-1111-111111111111";
const FEED_ID_2 = "22222222-2222-2222-2222-222222222222";
const SOURCE_ID = "33333333-3333-3333-3333-333333333333";
const SOURCE_ID_2 = "44444444-4444-4444-4444-444444444444";
const SOURCE_BASE_ID = "55555555-5555-5555-5555-555555555555";

describe("feeds list endpoint", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();
    (app as any).verifyAdmin = async () => {};
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  vi.unstubAllGlobals();
  });

  it("returns feeds with pagination metadata and summary counters", async () => {
    const now = new Date("2024-01-01T00:00:00.000Z");
    const feeds = [
      {
        id: FEED_ID,
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
        updatedAt: now,
        source: {
          id: SOURCE_ID,
          baseUrl: "https://tech.example.com",
          createdAt: now,
          updatedAt: now
        }
      },
      {
        id: FEED_ID_2,
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
        updatedAt: now,
        source: {
          id: SOURCE_ID_2,
          baseUrl: "https://finance.example.com",
          createdAt: now,
          updatedAt: now
        }
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
        feedId: FEED_ID,
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

    const payload = response.json();
    expect(response.statusCode).toBe(200);

    expect(payload.data).toHaveLength(1);
    expect(payload.data[0]).toMatchObject({
      id: FEED_ID,
      name: "Tech Daily",
      stats: {
        articleCount: 5
      }
    });
    expect(payload.data[0].source).toMatchObject({
      baseUrl: "https://tech.example.com"
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
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: {
          source: true
        }
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
          feedId: { in: [FEED_ID] }
        })
      })
    );
  });

  it("supports sorting by article count", async () => {
    const now = new Date("2024-01-01T00:00:00.000Z");
    const feeds = [
      {
        id: FEED_ID,
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
        updatedAt: now,
        source: {
          id: SOURCE_ID,
          baseUrl: "https://tech.example.com",
          createdAt: now,
          updatedAt: now
        }
      }
    ];

    const feedFindMany = vi
      .fn()
      .mockResolvedValueOnce(feeds)
      .mockResolvedValueOnce(
        feeds.map((feed) => ({
          category: feed.category,
          tags: feed.tags
        }))
      );

    (app as any).db = {
      feed: {
        findMany: feedFindMany,
        count: vi.fn().mockResolvedValue(1),
        findUnique: vi.fn().mockResolvedValue(feeds[0])
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

    await app.inject({
      method: "GET",
      url: "/feeds?sort=articleCount&order=asc"
    });

    expect(feedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ articles: { _count: "asc" } }, { id: "asc" }]
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

  it("creates a feed and links it to a source by base URL", async () => {
    const now = new Date("2024-01-01T00:00:00.000Z");
    const sourceUpsert = vi.fn().mockResolvedValue({
      id: SOURCE_ID,
      baseUrl: "https://tech.example.com",
      createdAt: now,
      updatedAt: now
    });
    const feedCreate = vi.fn().mockResolvedValue({ id: FEED_ID });
    const feedFindUnique = vi
      .fn()
      .mockImplementation(async (params: any) => {
        if (params.where?.url) {
          return null;
        }
        return {
          id: params.where.id,
          name: "Tech Daily",
          url: "https://tech.example.com/rss",
          category: null,
          tags: [],
          isActive: true,
          fetchIntervalMinutes: 30,
          lastFetchStatus: null,
          lastFetchAt: null,
          metadata: {},
          createdAt: now,
          updatedAt: now,
          source: {
            id: SOURCE_ID,
            baseUrl: "https://tech.example.com",
            createdAt: now,
            updatedAt: now
          }
        };
      });
    const articleAggregate = vi.fn().mockResolvedValue({
      _count: { _all: 0 },
      _max: { publishedAt: null }
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      body: {
        cancel: vi.fn().mockResolvedValue(undefined)
      }
    });
    vi.stubGlobal("fetch", fetchMock);

    (app as any).db = {
      source: {
        upsert: sourceUpsert
      },
      feed: {
        create: feedCreate,
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
      method: "POST",
      url: "/feeds",
      payload: {
        name: "Tech Daily",
        url: "https://tech.example.com/rss",
        tags: ["ai"]
      }
    });

    expect(response.statusCode).toBe(201);
    expect(sourceUpsert).toHaveBeenCalledWith({
      where: { baseUrl: "https://tech.example.com" },
      update: {},
      create: { baseUrl: "https://tech.example.com" }
    });

    const createCall = feedCreate.mock.calls[0]?.[0];
    expect(createCall).toBeDefined();
    expect(createCall.data.source).toEqual({
      connect: {
        id: SOURCE_ID
      }
    });

    const payload = response.json();
    expect(payload.source).toMatchObject({
      baseUrl: "https://tech.example.com"
    });
  });

  it("bulk import reuses the same source for feeds sharing a base URL", async () => {
    const now = new Date("2024-01-01T00:00:00.000Z");
  const sourceUpsert = vi.fn().mockImplementation(async ({ where }: any) => ({
      id: SOURCE_BASE_ID,
      baseUrl: where.baseUrl,
      createdAt: now,
      updatedAt: now
    }));
    const feedCreate = vi
      .fn()
      .mockResolvedValueOnce({ id: FEED_ID })
      .mockResolvedValueOnce({ id: FEED_ID_2 });
    const feedFindUnique = vi.fn().mockImplementation(async (params: any) => {
      if (params.where?.url) {
        return null;
      }
      return {
        id: params.where.id,
        name: params.where.id === FEED_ID ? "Tech Daily" : "Tech AI",
        url:
          params.where.id === FEED_ID
            ? "https://tech.example.com/rss"
            : "https://tech.example.com/ai",
        category: null,
        tags: [],
        isActive: true,
        fetchIntervalMinutes: 30,
        lastFetchStatus: null,
        lastFetchAt: null,
        metadata: {},
        createdAt: now,
        updatedAt: now,
        source: {
          id: SOURCE_BASE_ID,
          baseUrl: "https://tech.example.com",
          createdAt: now,
          updatedAt: now
        }
      };
    });
    const articleAggregate = vi.fn().mockResolvedValue({
      _count: { _all: 0 },
      _max: { publishedAt: null }
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      body: {
        cancel: vi.fn().mockResolvedValue(undefined)
      }
    });
    vi.stubGlobal("fetch", fetchMock);

    (app as any).db = {
      source: {
        upsert: sourceUpsert
      },
      feed: {
        create: feedCreate,
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
      method: "POST",
      url: "/feeds/import",
      payload: {
        feeds: [
          {
            name: "Tech Daily",
            url: "https://tech.example.com/rss"
          },
          {
            name: "Tech AI",
            url: "https://tech.example.com/ai"
          }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(sourceUpsert).toHaveBeenCalledTimes(2);
    expect(feedCreate).toHaveBeenCalledTimes(2);

    const firstCreate = feedCreate.mock.calls[0]?.[0];
    const secondCreate = feedCreate.mock.calls[1]?.[0];

    expect(firstCreate?.data.source).toEqual({
      connect: {
        id: SOURCE_BASE_ID
      }
    });
    expect(secondCreate?.data.source).toEqual({
      connect: {
        id: SOURCE_BASE_ID
      }
    });

    const payload = response.json();
    const successResults = payload.results.filter(
      (result: any) => result.status === "success"
    );
    expect(successResults).toHaveLength(2);
    for (const result of successResults) {
      expect(result.feed?.source).toMatchObject({
        baseUrl: "https://tech.example.com"
      });
    }
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
      id: FEED_ID,
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
      updatedAt: now,
      source: {
        id: SOURCE_ID,
        baseUrl: "https://tech.example.com",
        createdAt: now,
        updatedAt: now
      }
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
      url: `/feeds/${FEED_ID}`
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload).toMatchObject({
      id: FEED_ID,
      name: "Tech Daily",
      stats: {
        articleCount: 12
      },
      source: {
        baseUrl: "https://tech.example.com"
      }
    });
    expect(articleAggregate).toHaveBeenCalledWith({
      where: { feedId: FEED_ID },
      _count: { _all: true },
      _max: { publishedAt: true }
    });
  });
});


