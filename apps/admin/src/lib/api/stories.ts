import useSWR from "swr";

import { apiClient } from "./client";
import {
  storyListResponseSchema,
  type StoryListResponse,
  storyDetailSchema,
  type StoryDetail
} from "./types";

export type StoryQuery = {
  q?: string;
  from?: string;
  to?: string;
  language?: string;
  limit?: number;
  cursor?: string | null;
  categories?: string; // CSV
  tags?: string; // CSV
};

export function useStories(query: StoryQuery) {
  const searchParams = new URLSearchParams(
    Object.entries(query)
      .filter(([, value]) => {
        if (value === undefined || value === null || value === "") return false;
        if (typeof value === "number") return !Number.isNaN(value);
        return true;
      })
      .map(([key, value]) => [key, String(value)])
  );

  const key = `/stories?${searchParams.toString()}`;
  return useSWR<StoryListResponse>(key, async () => {
    const data = await apiClient.get<StoryListResponse>(key);
    return storyListResponseSchema.parse(data);
  });
}

export function useStoryDetail(storyId: string, page = 1, pageSize = 20) {
  const key = `/stories/${storyId}?page=${page}&pageSize=${pageSize}`;
  return useSWR<StoryDetail>(key, async () => {
    const data = await apiClient.get<StoryDetail>(key);
    return storyDetailSchema.parse(data);
  });
}

