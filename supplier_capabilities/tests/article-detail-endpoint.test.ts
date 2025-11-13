import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import { registerArticleRoutes } from "../../apps/api/src/modules/articles/routes.js";

describe("article detail endpoint", () => {
  it("returns cleaned content by default and exposes raw HTML when requested", async () => {
    const app = Fastify();
    (app as any).verifyAdmin = async () => {};

    const now = new Date("2024-01-01T00:00:00.000Z");
    const articleId = "00000000-0000-0000-0000-000000000001";

    const findUnique = vi.fn().mockResolvedValue({
      id: articleId,
      feedId: "00000000-0000-0000-0000-000000000010",
      title: "Sample Article",
      summary: "Summary",
      content: "Readable body",
      sourceUrl: "https://example.com/article",
      canonicalUrl: "https://example.com/article",
      author: "Reporter",
      language: "en",
      keywords: ["news"],
      publishedAt: now,
      fetchedAt: now,
      createdAt: now,
      updatedAt: now,
      feed: {
        name: "Feed One",
        category: "Technology"
      },
      articleMetadata: {
        enrichmentStatus: "success",
        enrichedAt: now,
        retries: 0,
        openGraph: {},
        twitterCard: {},
        metadata: {},
        faviconUrl: null,
        heroImageUrl: null,
        contentType: "article",
        languageConfidence: {},
        readingTimeSeconds: 120,
        wordCount: 400,
        errorMessage: null,
        contentPlain: "Readable body",
        rawContentHtml: "<html>Readable body</html>"
      }
    });

    (app as any).db = {
      article: {
        findUnique
      }
    };

    await registerArticleRoutes(app as any);

    const baseResponse = await app.inject({
      method: "GET",
      url: `/articles/${articleId}`
    });

    expect(baseResponse.statusCode).toBe(200);
    const basePayload = baseResponse.json();
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(basePayload.contentPlain).toBe("Readable body");
    expect(basePayload.rawContentHtml).toBeUndefined();
    expect(basePayload.hasFullContent).toBe(true);

    const rawResponse = await app.inject({
      method: "GET",
      url: `/articles/${articleId}?includeRaw=true`
    });

    expect(rawResponse.statusCode).toBe(200);
    const rawPayload = rawResponse.json();
    expect(rawPayload.rawContentHtml).toBe("<html>Readable body</html>");
    expect(rawPayload.contentPlain).toBe("Readable body");
    expect(rawPayload.hasFullContent).toBe(true);
  });
});
