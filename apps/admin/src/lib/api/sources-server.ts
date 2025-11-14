import { serverApiFetch } from "@/lib/api/server-fetch";
import {
  sourceListResponseSchema,
  type SourceListResponse
} from "@/lib/api/types";
import type { SourceListParams } from "./sources";

const endpoint = "/sources";

export async function getSourceList(
  params: SourceListParams = {}
): Promise<SourceListResponse> {
  const path = buildSourceListPath(params);
  const data = await serverApiFetch<SourceListResponse>(path);
  return sourceListResponseSchema.parse(data);
}

function buildSourceListPath(params: SourceListParams): string {
  const query = buildSourceListSearchParams(params);
  return query ? `${endpoint}?${query}` : endpoint;
}

function buildSourceListSearchParams(params: SourceListParams) {
  const search = new URLSearchParams();

  if (params.q) {
    search.set("q", params.q);
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

