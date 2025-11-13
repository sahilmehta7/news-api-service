import { serverApiFetch } from "@/lib/api/server-fetch";
import {
  feedListResponseSchema,
  feedSchema,
  type Feed,
  type FeedListResponse
} from "@/lib/api/types";
import type { FeedListParams } from "./feeds";

const endpoint = "/feeds";

export async function getFeedList(
  params: FeedListParams = {}
): Promise<FeedListResponse> {
  const path = buildFeedListPath(params);
  const data = await serverApiFetch<FeedListResponse>(path);
  return feedListResponseSchema.parse(data);
}

export async function getFeedById(id: string): Promise<Feed> {
  const data = await serverApiFetch<Feed>(`${endpoint}/${id}`);
  return feedSchema.parse(data);
}

function buildFeedListPath(params: FeedListParams): string {
  const query = buildFeedListSearchParams(params);
  return query ? `${endpoint}?${query}` : endpoint;
}

function buildFeedListSearchParams(params: FeedListParams) {
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

