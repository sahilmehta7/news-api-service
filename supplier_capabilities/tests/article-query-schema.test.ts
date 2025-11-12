import { describe, expect, it } from "vitest";

import { articleListQuerySchema } from "../../apps/api/src/modules/articles/schemas.js";

describe("articleListQuerySchema", () => {
  it("applies defaults and transforms query params", () => {
    const parsed = articleListQuerySchema.parse({
      page: "2",
      pageSize: "50",
      hasMedia: "true",
      sort: "relevance",
      order: "asc",
      keywords: "ai,ml ",
      q: "news"
    });

    expect(parsed.page).toBe(2);
    expect(parsed.pageSize).toBe(50);
    expect(parsed.hasMedia).toBe(true);
    expect(parsed.sort).toBe("relevance");
    expect(parsed.order).toBe("asc");
    expect(parsed.keywords).toEqual(["ai", "ml"]);
    expect(parsed.q).toBe("news");
  });

  it("sets defaults when optional values are missing", () => {
    const parsed = articleListQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(20);
    expect(parsed.hasMedia).toBeUndefined();
    expect(parsed.sort).toBe("publishedAt");
    expect(parsed.order).toBe("desc");
    expect(parsed.keywords).toEqual([]);
  });
});

