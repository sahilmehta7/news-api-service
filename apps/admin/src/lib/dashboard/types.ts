export interface DashboardSnapshot {
  /** Feed ingestion pipeline health KPIs sourced from worker Prometheus metrics. */
  pipeline: {
    queueSize: number;
    ingestionSuccessRate: number;
    ingestionFailureRate: number;
    enrichmentSuccessRate: number;
    enrichmentFailureRate: number;
    ingestionTrend: Array<{ timestamp: string; success: number; failed: number }>;
    enrichmentTrend: Array<{ timestamp: string; success: number; failed: number }>;
    topFeeds: Array<{ feedId: string; articles: number }>;
  };
  /** API layer telemetry derived from API Prometheus metrics. */
  api: {
    totalRequests: number;
    errorRate: number;
    avgLatencyMs: number | null;
    topRoutes: Array<{ route: string; total: number; errorRate: number }>;
    errorTrend: Array<{ timestamp: string; errorRate: number }>;
  };
  /** Feed-specific issues requiring operator attention, from `/feeds` data & new `/feeds/issues`. */
  feedAlerts: Array<{
    feedId: string;
    severity: "warning" | "error";
    message: string;
    lastSeenAt: string;
  }>;
  /** Recent warning/error log entries for activity timeline, using `/logs?status=warning,error`. */
  activity: Array<{
    id: string;
    occurredAt: string;
    type: "ingestion" | "enrichment" | "api" | "system";
    status: "success" | "warning" | "error";
    title: string;
    detail?: string;
    href?: string;
  }>;
  /** Articles throughput summary, combining article API aggregations and worker metrics. */
  articles: {
    ingested: number;
    enriched: number;
    pendingEnrichment: number;
    topLanguages: Array<{ language: string; count: number }>;
  };
  /** Snapshot timestamp and reporting window metadata shared across sections. */
  meta: {
    generatedAt: string;
    window: {
      label: "12h" | "24h" | "7d";
      start: string;
      end: string;
    };
  };
}

export interface DashboardDataRequirement {
  key: keyof DashboardSnapshot;
  description: string;
  source: string;
  gaps?: string;
}

export const DASHBOARD_DATA_REQUIREMENTS: DashboardDataRequirement[] = [
  {
    key: "pipeline",
    description:
      "Provide queue size plus ingestion/enrichment success & failure counts with trends for the selected window.",
    source:
      "Prometheus metrics `news_worker_ingestion_attempts_total`, `news_worker_enrichment_attempts_total`, `news_worker_enrichment_queue_size`. Need rollups grouped by status & time.",
    gaps:
      "Existing summary lacks historical trend data; requires aggregation or new endpoint."
  },
  {
    key: "api",
    description:
      "Expose API throughput, error rate, latency, and worst routes with trendline.",
    source:
      "Prometheus metrics `news_api_http_requests_total`, `news_api_http_request_duration_seconds_*`.",
    gaps:
      "Route-level data exists; need time-bucket aggregation for errorTrend."
  },
  {
    key: "feedAlerts",
    description:
      "List feeds with warning/error status and concise remediation hints.",
    source:
      "Extend `/feeds` API or add `/feeds/issues` returning feeds with `lastFetchStatus` in warning/error.",
    gaps:
      "No dedicated endpoint; must add server aggregator for quick summary."
  },
  {
    key: "activity",
    description:
      "Show most recent warning/error events from ingestion, enrichment, and API layers.",
    source:
      "Existing `/logs` endpoint filtered by `status=warning,error` with `pageSize=10`.",
    gaps:
      "Need dedicated helper for mapping log entries into display-friendly timeline items."
  },
  {
    key: "articles",
    description:
      "Summarize articles processed vs enriched, backlog, and top languages.",
    source:
      "Combine articles API aggregates (new `/articles/highlights`) with worker metrics on queue size.",
    gaps:
      "Requires backend aggregation endpoint or DB query summarizing article counts and languages."
  },
  {
    key: "meta",
    description:
      "Standardize timeframe metadata across modules for consistent labeling.",
    source:
      "Derived from user-selected window (nuqs) with server timestamp via `new Date().toISOString()`.",
    gaps: undefined
  }
];

