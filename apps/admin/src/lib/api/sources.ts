import useSWR, { type SWRConfiguration, type SWRResponse } from "swr";

import { apiClient } from "./client";
import {
  sourceListResponseSchema,
  type SourceListResponse
} from "./types";

const endpoint = "/sources";

export type SourceListSort = "baseUrl" | "createdAt" | "updatedAt";
export type SourceListOrder = "asc" | "desc";

export interface SourceListParams {
  q?: string;
  hasFeeds?: boolean;
  sort?: SourceListSort;
  order?: SourceListOrder;
  limit?: number;
  cursor?: string | null;
}

type SourceListKey = string;

export function useSourceList(
  params: SourceListParams = {},
  config?: SWRConfiguration<SourceListResponse>
): SWRResponse<SourceListResponse> {
  const key = createSourceListKey(params);
  return useSWR<SourceListResponse>(key, fetchSourceListClient, config);
}

async function fetchSourceListClient(key: SourceListKey) {
  const data = await apiClient.get<SourceListResponse>(key);
  return sourceListResponseSchema.parse(data);
}

function createSourceListKey(params: SourceListParams = {}): SourceListKey {
  const query = buildSourceListSearchParams(params);
  return query ? `${endpoint}?${query}` : endpoint;
}

export function getSourceListKey(params: SourceListParams = {}): string {
  return createSourceListKey(params);
}

export function buildSourceListSearchParams(params: SourceListParams = {}) {
  const search = new URLSearchParams();

  if (params.q) {
    search.set("q", params.q);
  }

  if (params.hasFeeds !== undefined) {
    search.set("hasFeeds", params.hasFeeds ? "true" : "false");
  }

  if (params.sort) {
    search.set("sort", params.sort);
  }

  if (params.order) {
    search.set("order", params.order);
  }

  if (typeof params.limit === "number") {
    search.set("limit", String(params.limit));
  }

  if (params.cursor) {
    search.set("cursor", params.cursor);
  }

  return search.toString();
}

export interface SourceFeedsParams {
  limit?: number;
  cursor?: string;
}

export interface SourceFeed {
  id: string;
  name: string;
  url: string;
  category: string | null;
  isActive: boolean;
  lastFetchStatus: string | null;
  lastFetchAt: string | null;
}

export interface SourceFeedsResponse {
  data: SourceFeed[];
  pagination: {
    limit: number;
    hasNextPage: boolean;
    total: number;
  };
}

export function useSourceFeeds(sourceId: string | null, params: SourceFeedsParams = {}) {
  const key = sourceId ? `/sources/${sourceId}/feeds?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()}` : null;
  return useSWR<SourceFeedsResponse>(key, async (path: string) => {
    const data = await apiClient.get<SourceFeedsResponse>(path);
    return data;
  });
}

