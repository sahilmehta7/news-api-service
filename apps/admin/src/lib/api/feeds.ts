import useSWR, { mutate } from "swr";
import type { SWRConfiguration, SWRResponse } from "swr";

import { apiClient } from "./client";
import {
  feedListResponseSchema,
  feedSchema,
  bulkImportResponseSchema,
  bulkImportPayloadSchema,
  type Feed,
  type FeedInput,
  type FeedListResponse,
  type BulkImportResponse,
  type BulkImportPayload
} from "./types";

const endpoint = "/feeds";

export type FeedListSort = "name" | "createdAt" | "lastFetchAt" | "articleCount";
export type FeedListOrder = "asc" | "desc";

export interface FeedListParams {
  q?: string;
  categories?: string[];
  tags?: string[];
  lastFetchStatuses?: string[];
  isActive?: boolean;
  hasIssues?: boolean;
  sort?: FeedListSort;
  order?: FeedListOrder;
  limit?: number;
  cursor?: string | null;
}

type FeedListKey = string;

export function useFeedList(
  params: FeedListParams = {},
  config?: SWRConfiguration<FeedListResponse>
): SWRResponse<FeedListResponse> {
  const key = createFeedListKey(params);
  return useSWR<FeedListResponse>(key, fetchFeedListClient, {
    ...config,
    onErrorRetry: (error, _key, _config, revalidate, context) => {
      const retryCount = context.retryCount ?? 0;
      if (error?.status === 401) return;
      if (retryCount >= 2) return;
      setTimeout(() => revalidate({ retryCount }), 2000);
      config?.onErrorRetry?.(error, _key, _config, revalidate, context);
    }
  });
}

async function fetchFeedListClient(key: FeedListKey) {
  const data = await apiClient.get<FeedListResponse>(key);
  return feedListResponseSchema.parse(data);
}

export function useFeeds(params: FeedListParams = {}) {
  return useFeedList({
    limit: 200,
    sort: "name",
    order: "asc",
    ...params
  });
}

export async function createFeed(input: FeedInput) {
  const feed = feedSchema.parse(await apiClient.post<Feed>(endpoint, input));
  await revalidateFeedLists();
  void requestFeedIngestion(feed.id).catch(() => {
    /* noop */
  });
  return feed;
}

export async function updateFeed(id: string, input: FeedInput) {
  const feed = feedSchema.parse(
    await apiClient.patch<Feed>(`${endpoint}/${id}`, input)
  );
  await revalidateFeedLists();
  return feed;
}

export async function deleteFeed(id: string) {
  await apiClient.delete(`${endpoint}/${id}`);
  await revalidateFeedLists();
}

export async function requestFeedIngestion(id: string) {
  await apiClient.post(`${endpoint}/${id}/ingest`, {});
}

export async function bulkImportFeeds(
  payload: unknown
): Promise<BulkImportResponse> {
  const parsed = bulkImportPayloadSchema.parse(payload) as BulkImportPayload;
  const data = await apiClient.post<BulkImportResponse>(
    `${endpoint}/import`,
    parsed
  );
  return bulkImportResponseSchema.parse(data);
}

export async function fetchFeedById(id: string) {
  const data = await apiClient.get<Feed>(`${endpoint}/${id}`);
  return feedSchema.parse(data);
}

function createFeedListKey(params: FeedListParams = {}): FeedListKey {
  const query = buildFeedListSearchParams(params);
  return query ? `${endpoint}?${query}` : endpoint;
}

export function getFeedListKey(params: FeedListParams = {}): string {
  return createFeedListKey(params);
}

function buildFeedListSearchParams(params: FeedListParams = {}) {
  const search = new URLSearchParams();

  if (params.q) {
    search.set("q", params.q);
  }

  for (const category of params.categories ?? []) {
    if (category) {
      search.append("categories", category);
    }
  }

  for (const tag of params.tags ?? []) {
    if (tag) {
      search.append("tags", tag);
    }
  }

  for (const status of params.lastFetchStatuses ?? []) {
    if (status) {
      search.append("lastFetchStatuses", status);
    }
  }

  if (typeof params.isActive === "boolean") {
    search.set("isActive", String(params.isActive));
  }

  if (typeof params.hasIssues === "boolean") {
    search.set("hasIssues", String(params.hasIssues));
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

async function revalidateFeedLists() {
  await mutate(
    (key) => typeof key === "string" && key.startsWith(endpoint),
    undefined,
    {
      revalidate: true
    }
  );
}

