import useSWR from "swr";

import { apiClient } from "./client";
import {
  articleListResponseSchema,
  type ArticleListResponse,
  articleSchema,
  type Article,
  articleHighlightsResponseSchema,
  type ArticleHighlightsResponse
} from "./types";

export type ArticleQuery = {
  page?: number;
  pageSize?: number;
  feedId?: string;
  feedCategory?: string;
  language?: string;
  fromDate?: string;
  toDate?: string;
  q?: string;
  sort?: "publishedAt" | "fetchedAt" | "relevance";
  order?: "asc" | "desc";
  enrichmentStatus?: string;
  hasMedia?: boolean;
};

export function useArticles(query: ArticleQuery) {
  const searchParams = new URLSearchParams(
    Object.entries(query)
      .filter(([, value]) => {
        if (value === undefined || value === null || value === "") return false;
        if (typeof value === "number") return !Number.isNaN(value);
        return true;
      })
      .map(([key, value]) => [key, String(value)])
  );

  const key = `/articles?${searchParams.toString()}`;
  return useSWR<ArticleListResponse>(key, async () => {
    const data = await apiClient.get<ArticleListResponse>(key);
    return articleListResponseSchema.parse(data);
  });
}

export function getDefaultArticleQuery(): ArticleQuery {
  return {
    page: 1,
    pageSize: 20,
    sort: "publishedAt",
    order: "desc"
  };
}

export function useArticleDetail(
  articleId: string | null,
  options: { includeRaw?: boolean; fallbackData?: Article | undefined } = {}
) {
  const includeRaw = options.includeRaw ?? false;
  const key = articleId
    ? `/articles/${articleId}${includeRaw ? "?includeRaw=true" : ""}`
    : null;

  return useSWR<Article>(
    key,
    async (path: string) => {
      const data = await apiClient.get<Article>(path);
      return articleSchema.parse(data);
    },
    {
      fallbackData: options.fallbackData,
      keepPreviousData: true,
      revalidateOnFocus: false
    }
  );
}

export async function retryArticleEnrichment(articleId: string) {
  await apiClient.post(`/articles/${articleId}/retry-enrichment`, {});
}

type BulkRetryResponse = {
  status: string;
  updated: number;
};

export async function retryFailedArticlesEnrichment() {
  return apiClient.post<BulkRetryResponse>(
    "/articles/retry-enrichment/bulk",
    {}
  );
}

export async function getArticleHighlights(
  params: { window?: "12h" | "24h" | "7d" } = {}
) {
  const search = new URLSearchParams();
  if (params.window) {
    search.set("window", params.window);
  }
  const suffix = search.toString() ? `?${search.toString()}` : "";
  const data = await apiClient.get<ArticleHighlightsResponse>(
    `/articles/highlights${suffix}`
  );
  return articleHighlightsResponseSchema.parse(data);
}

