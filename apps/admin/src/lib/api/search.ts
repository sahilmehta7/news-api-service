import * as React from "react";
import useSWR from "swr";

import { apiClient } from "./client";
import { articleListResponseSchema, type ArticleListResponse } from "./types";

export type SearchQuery = {
  q?: string;
  from?: string; // ISO date string
  to?: string; // ISO date string
  language?: string;
  feedId?: string;
  feedCategory?: string;
  size?: number;
  offset?: number;
  groupByStory?: boolean;
};

export function useSearchArticles(query: SearchQuery) {
  // Build search params in a consistent way to ensure proper caching
  const searchParams = React.useMemo(() => {
    const params = new URLSearchParams();

    if (query.q) params.set("q", query.q);
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    if (query.language) params.set("language", query.language);
    if (query.feedId) params.set("feedId", query.feedId);
    if (query.feedCategory) params.set("feedCategory", query.feedCategory);
    params.set("size", String(query.size ?? 20));
    params.set("offset", String(query.offset ?? 0));
    if (query.groupByStory) {
      params.set("groupByStory", "true");
    }

    return params;
  }, [query.q, query.from, query.to, query.language, query.feedId, query.feedCategory, query.size, query.offset, query.groupByStory]);

  const key = `/search?${searchParams.toString()}`;
  
  return useSWR<ArticleListResponse>(
    key,
    async () => {
      const data = await apiClient.get<ArticleListResponse>(key);
      return articleListResponseSchema.parse(data);
    },
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    }
  );
}

