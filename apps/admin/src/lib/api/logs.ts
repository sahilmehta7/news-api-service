import useSWR from "swr";

import { apiClient } from "./client";
import {
  logListResponseSchema,
  type LogEntry
} from "./types";

export type LogsQuery = {
  page?: number;
  pageSize?: number;
  feedId?: string;
  status?: string;
  operation?: string;
  search?: string;
};

export type LogsResponse = {
  data: LogEntry[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    hasNextPage: boolean;
  };
};

export function useLogs(query: LogsQuery) {
  const searchParams = new URLSearchParams(
    Object.entries(query)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => [key, String(value)])
  );

  const key = `/logs?${searchParams.toString()}`;

  return useSWR<LogsResponse>(key, async () => {
    const data = await apiClient.get<LogsResponse>(key);
    return logListResponseSchema.parse(data);
  });
}

