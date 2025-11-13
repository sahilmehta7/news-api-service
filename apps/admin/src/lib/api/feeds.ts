import useSWR, { mutate } from "swr";
import { apiClient } from "./client";
import {
  feedSchema,
  bulkImportResponseSchema,
  bulkImportPayloadSchema,
  type Feed,
  type FeedInput,
  type BulkImportResponse,
  type BulkImportPayload
} from "./types";

const endpoint = "/feeds";

export function useFeeds() {
  return useSWR<Feed[]>(endpoint, fetchFeeds, {
    onErrorRetry: (error, _key, _config, revalidate, { retryCount }) => {
      if (error.status === 401) return;
      if (retryCount >= 2) return;
      setTimeout(() => revalidate({ retryCount }), 2000);
    }
  });
}

async function fetchFeeds() {
  const data = await apiClient.get<Feed[]>(endpoint);
  return feedSchema.array().parse(data);
}

export async function createFeed(input: FeedInput) {
  const feed = feedSchema.parse(await apiClient.post<Feed>(endpoint, input));
  await mutate(endpoint, async (current: Feed[] = []) => [feed, ...current], {
    revalidate: false
  });
  void requestFeedIngestion(feed.id).catch(() => {
    /* noop */
  });
  return feed;
}

export async function updateFeed(id: string, input: FeedInput) {
  const feed = feedSchema.parse(await apiClient.patch<Feed>(`${endpoint}/${id}`, input));
  await mutate(
    endpoint,
    async (current: Feed[] = []) =>
      current.map((item) => (item.id === feed.id ? feed : item)),
    { revalidate: false }
  );
  return feed;
}

export async function deleteFeed(id: string) {
  await apiClient.delete(`${endpoint}/${id}`);
  await mutate(
    endpoint,
    async (current: Feed[] = []) => current.filter((item) => item.id !== id),
    { revalidate: false }
  );
}

export async function requestFeedIngestion(id: string) {
  await apiClient.post(`${endpoint}/${id}/ingest`, {});
}

export async function bulkImportFeeds(payload: unknown): Promise<BulkImportResponse> {
  const parsed = bulkImportPayloadSchema.parse(payload) as BulkImportPayload;
  const data = await apiClient.post<BulkImportResponse>(`${endpoint}/import`, parsed);
  return bulkImportResponseSchema.parse(data);
}

