import { describe, expect, it } from "vitest";

import { buildArticleQuery, filtersFromState } from "@/lib/articles-query";

describe("buildArticleQuery", () => {
  it("builds a query with defaults when state is empty", () => {
    const query = buildArticleQuery({}, 20);

    expect(query).toMatchObject({
      page: 1,
      pageSize: 20,
      sort: "publishedAt",
      order: "desc"
    });
  });

  it("converts string flags into booleans", () => {
    const query = buildArticleQuery(
      {
        hasMedia: "true",
        q: "open ai"
      },
      10
    );

    expect(query.hasMedia).toBe(true);
    expect(query.q).toBe("open ai");
  });

  it("falls back to publishedAt when relevance is selected without a search term", () => {
    const query = buildArticleQuery(
      {
        sort: "relevance"
      },
      50
    );

    expect(query.sort).toBe("publishedAt");
  });

  it("keeps relevance sorting when a keyword is provided", () => {
    const query = buildArticleQuery(
      {
        sort: "relevance",
        q: "climate change"
      },
      25
    );

    expect(query.sort).toBe("relevance");
  });

  it("normalizes pagination and order defaults", () => {
    const query = buildArticleQuery(
      {
        page: -10,
        order: "asc",
        q: "ai"
      },
      15
    );

    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(15);
    expect(query.order).toBe("asc");
  });
});

describe("filtersFromState", () => {
  it("maps persisted search params to filter values", () => {
    const filters = filtersFromState({
      feedId: "feed-id",
      enrichmentStatus: "failed",
      language: "en",
      hasMedia: "false",
      fromDate: "2024-01-01",
      toDate: "2024-02-01"
    });

    expect(filters).toEqual({
      feedId: "feed-id",
      enrichmentStatus: "failed",
      language: "en",
      hasMedia: "false",
      fromDate: "2024-01-01",
      toDate: "2024-02-01"
    });
  });

  it("omits empty values from the filters object", () => {
    const filters = filtersFromState({
      feedId: null,
      enrichmentStatus: undefined,
      language: "",
      hasMedia: "maybe",
      fromDate: null,
      toDate: null
    });

    expect(filters).toEqual({
      feedId: undefined,
      enrichmentStatus: undefined,
      language: undefined,
      hasMedia: undefined,
      fromDate: undefined,
      toDate: undefined
    });
  });
});

