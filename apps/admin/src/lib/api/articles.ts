import useSWR from "swr";

import { apiClient } from "./client";
import {
  articleListResponseSchema,
  type ArticleListResponse
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

export async function retryArticleEnrichment(articleId: string) {
  await apiClient.post(`/articles/${articleId}/retry-enrichment`, {});
}

