import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSearchRoutes } from "../../apps/api/src/modules/search/routes.js";

describe("stories endpoints", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();
    (app as any).verifyAdmin = async () => {};
    (app as any).searchClient = null; // Search disabled
    (app as any).config = {
      search: {
        enabled: false
      }
    };
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 200 for stories list endpoint when search is disabled", async () => {
    // When search is disabled, should return empty or fallback
    const articleFindMany = vi.fn().mockResolvedValue([]);
    const articleCount = vi.fn().mockResolvedValue(0);
    const articleGroupBy = vi.fn().mockResolvedValue([]);

    (app as any).db = {
      article: {
        findMany: articleFindMany,
        count: articleCount,
        groupBy: articleGroupBy
      }
    };

    await registerSearchRoutes(app as any);

    const response = await app.inject({
      method: "GET",
      url: "/stories"
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload).toHaveProperty("data");
    expect(payload).toHaveProperty("pagination");
  });

  it("handles pagination parameters", async () => {
    const articleFindMany = vi.fn().mockResolvedValue([]);
    const articleCount = vi.fn().mockResolvedValue(0);
    const articleGroupBy = vi.fn().mockResolvedValue([]);

    (app as any).db = {
      article: {
        findMany: articleFindMany,
        count: articleCount,
        groupBy: articleGroupBy
      }
    };

    await registerSearchRoutes(app as any);

    await app.inject({
      method: "GET",
      url: "/stories?offset=10&size=20"
    });

    // Verify pagination is handled
    expect(articleFindMany).toHaveBeenCalled();
  });

  it("handles story detail endpoint", async () => {
    const articleFindMany = vi.fn().mockResolvedValue([]);
    const articleCount = vi.fn().mockResolvedValue(0);

    (app as any).db = {
      article: {
        findMany: articleFindMany,
        count: articleCount
      }
    };
    (app as any).log = {
      warn: vi.fn()
    };

    await registerSearchRoutes(app as any);

    const response = await app.inject({
      method: "GET",
      url: "/stories/test-story-id"
    });

    // Should return 404 for missing story or 200 with empty data
    expect([200, 404]).toContain(response.statusCode);
  });
});

