"use client";

import useSWR from "swr";

import { fetchMetricsSummary, type MetricsSummary } from "@/lib/metrics/summary";

export function useMetricsSummary() {
  return useSWR<MetricsSummary>("metrics-summary", fetchMetricsSummary, {
    refreshInterval: 30_000,
    revalidateOnFocus: false
  });
}


