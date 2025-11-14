import useSWR from "swr";
import { apiClient } from "./client";
import type { SearchSettingsResponse } from "./types";
import { searchSettingsResponseSchema } from "./types";

async function fetchSearchSettings(): Promise<SearchSettingsResponse> {
  const data = await apiClient.get<SearchSettingsResponse>("/settings/search");
  return searchSettingsResponseSchema.parse(data);
}

export function useSearchSettings() {
  return useSWR<SearchSettingsResponse>("search-settings", fetchSearchSettings, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    refreshInterval: 30000, // Refresh every 30 seconds
    onErrorRetry: (error, _key, _config, revalidate, context) => {
      const retryCount = context.retryCount ?? 0;
      if (error?.status === 401) return;
      if (retryCount >= 2) return;
      setTimeout(() => revalidate({ retryCount }), 2000);
    }
  });
}

