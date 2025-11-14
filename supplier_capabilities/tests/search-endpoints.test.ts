import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSearchRoutes } from "../../apps/api/src/modules/search/routes.js";

describe("search endpoints", () => {
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

  it("returns 200 for search endpoint when search is disabled", async () => {
    // Mock database fallback
    const articleFindMany = vi.fn().mockResolvedValue([]);
    const articleCount = vi.fn().mockResolvedValue(0);

    (app as any).db = {
      article: {
        findMany: articleFindMany,
        count: articleCount
      }
    };
    (app as any).embeddingProvider = {
      embed: vi.fn().mockRejectedValue(new Error("Not available"))
    };

    await registerSearchRoutes(app as any);

    const response = await app.inject({
      method: "GET",
      url: "/search?q=test"
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload).toHaveProperty("data");
    expect(payload).toHaveProperty("pagination");
  });

  it("handles search query parameters", async () => {
    const articleFindMany = vi.fn().mockResolvedValue([]);
    const articleCount = vi.fn().mockResolvedValue(0);

    (app as any).db = {
      article: {
        findMany: articleFindMany,
        count: articleCount
      }
    };
    (app as any).embeddingProvider = {
      embed: vi.fn().mockRejectedValue(new Error("Not available"))
    };

    await registerSearchRoutes(app as any);

    await app.inject({
      method: "GET",
      url: "/search?q=test&offset=20&size=50"
    });

    // Verify query parameters are processed
    expect(articleFindMany).toHaveBeenCalled();
  });

  it("handles empty search query", async () => {
    const articleFindMany = vi.fn().mockResolvedValue([]);
    const articleCount = vi.fn().mockResolvedValue(0);

    (app as any).db = {
      article: {
        findMany: articleFindMany,
        count: articleCount
      }
    };
    (app as any).embeddingProvider = {
      embed: vi.fn().mockRejectedValue(new Error("Not available"))
    };

    await registerSearchRoutes(app as any);

    const response = await app.inject({
      method: "GET",
      url: "/search"
    });

    expect(response.statusCode).toBe(200);
  });
});

