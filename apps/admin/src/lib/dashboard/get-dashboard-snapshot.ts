import { cache } from "react";

import { serverApiFetch } from "@/lib/api/server-fetch";
import {
  feedListResponseSchema,
  logListResponseSchema,
  type Feed,
  type FeedListResponse,
  type LogEntry,
  articleHighlightsResponseSchema,
  type ArticleHighlightsResponse
} from "@/lib/api/types";
import { getMetricsSummary, type MetricsSummary } from "@/lib/metrics/summary";
import type { DashboardSnapshot } from "@/lib/dashboard/types";
import { formatErrorMessage } from "@/lib/utils/format-error-message";

const WINDOW_OFFSETS: Record<DashboardWindow, number> = {
  "12h": 12 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000
};

export type DashboardWindow = "12h" | "24h" | "7d";

export const getDashboardSnapshot = cache(
  async (window: DashboardWindow = "24h"): Promise<DashboardSnapshot> => {
    const now = new Date();
    const offsetMs = WINDOW_OFFSETS[window] ?? WINDOW_OFFSETS["24h"];
    const start = new Date(now.getTime() - offsetMs);

    const [metrics, feedsRaw, logsRaw, highlightsRaw] = await Promise.all([
      getMetricsSummary(),
      serverApiFetch("/feeds"),
      serverApiFetch(`/logs?${buildLogsQuery()}`),
      serverApiFetch(`/articles/highlights?window=${window}`)
    ]);

    const feedList = feedListResponseSchema.parse(feedsRaw);
    const feeds = feedList.data;
    const logs = logListResponseSchema.parse(logsRaw);
    const highlights = articleHighlightsResponseSchema.parse(
      highlightsRaw
    ) satisfies ArticleHighlightsResponse;

    return {
      pipeline: computePipeline(metrics),
      api: computeApi(metrics),
      feedAlerts: buildFeedAlerts(feeds),
      activity: buildActivity(logs.data),
      articles: buildArticles(highlights, metrics, feedList.summary),
      meta: {
        generatedAt: now.toISOString(),
        window: {
          label: window,
          start: start.toISOString(),
          end: now.toISOString()
        }
      }
    };
  }
);

function computePipeline(metrics: MetricsSummary): DashboardSnapshot["pipeline"] {
  const ingestionSuccess = metrics.worker.ingestionByStatus.success ?? 0;
  const ingestionFailure = metrics.worker.ingestionByStatus.failed ?? 0;
  const ingestionTotal = ingestionSuccess + ingestionFailure;

  const enrichmentSuccess = metrics.worker.enrichmentByStatus.success ?? 0;
  const enrichmentFailure = metrics.worker.enrichmentByStatus.failed ?? 0;
  const enrichmentTotal = enrichmentSuccess + enrichmentFailure;

  return {
    queueSize: metrics.worker.queueSize,
    ingestionSuccessRate:
      ingestionTotal > 0 ? ingestionSuccess / ingestionTotal : 0,
    ingestionFailureRate:
      ingestionTotal > 0 ? ingestionFailure / ingestionTotal : 0,
    enrichmentSuccessRate:
      enrichmentTotal > 0 ? enrichmentSuccess / enrichmentTotal : 0,
    enrichmentFailureRate:
      enrichmentTotal > 0 ? enrichmentFailure / enrichmentTotal : 0,
    ingestionTrend: [],
    enrichmentTrend: [],
    topFeeds: metrics.worker.topFeeds.slice(0, 5)
  };
}

function computeApi(metrics: MetricsSummary): DashboardSnapshot["api"] {
  return {
    totalRequests: metrics.api.totalRequests,
    errorRate: metrics.api.errorRate,
    avgLatencyMs: metrics.api.avgLatencyMs,
    topRoutes: metrics.api.routes.slice(0, 5),
    errorTrend: []
  };
}

function buildFeedAlerts(feeds: Feed[]): DashboardSnapshot["feedAlerts"] {
  return feeds
    .filter((feed) =>
      feed.lastFetchStatus
        ? ["warning", "failure", "error"].includes(feed.lastFetchStatus)
        : false
    )
    .map((feed) => {
      const severity =
        feed.lastFetchStatus === "warning" ? "warning" : "error";
      const lastSeenAt = feed.lastFetchAt ?? feed.updatedAt;
      return {
        feedId: feed.id,
        severity,
        message:
          feed.lastFetchStatus === "warning"
            ? `Feed ${feed.name} reported warnings during the last fetch run.`
            : `Feed ${feed.name} failed during the last fetch run.`,
        lastSeenAt: lastSeenAt ?? new Date().toISOString()
      };
    });
}

function buildActivity(logs: LogEntry[]): DashboardSnapshot["activity"] {
  return logs.slice(0, 10).map((log) => {
    const status =
      log.status === "failure"
        ? "error"
        : log.status === "running"
          ? "warning"
          : "success";

    const type =
      log.operation === "feed_import"
        ? "system"
        : log.operation === "fetch"
          ? "ingestion"
          : "system";

    const title =
      log.status === "failure"
        ? log.feedName
          ? `Failed fetch for ${log.feedName}`
          : "Fetch failure"
        : log.feedName
          ? `Fetch ${log.status} for ${log.feedName}`
          : `Fetch ${log.status}`;

    return {
      id: log.id,
      occurredAt: log.startedAt,
      type,
      status,
      title,
      detail: extractLogDetail(log),
      href: buildLogLink(log)
    };
  });
}

function buildArticles(
  highlights: ArticleHighlightsResponse,
  metrics: MetricsSummary,
  feedSummary: FeedListResponse["summary"]
): DashboardSnapshot["articles"] {
  return {
    ingested: feedSummary.totalArticles,
    enriched: highlights.enriched,
    pendingEnrichment: Math.max(
      highlights.pendingEnrichment,
      metrics.worker.queueSize
    ),
    topLanguages: highlights.topLanguages
  };
}

function buildLogsQuery() {
  const params = new URLSearchParams({
    page: "1",
    pageSize: "20"
  });
  return params.toString();
}

function buildLogLink(log: LogEntry) {
  const params = new URLSearchParams({
    page: "1",
    pageSize: "25",
    ...(log.feedId ? { feedId: log.feedId } : {}),
    ...(log.status ? { status: log.status } : {})
  });
  return `/dashboard/logs?${params.toString()}`;
}

function extractLogDetail(log: LogEntry) {
  if (log.errorMessage) {
    return formatErrorMessage(log.errorMessage);
  }
  if (log.errorStack) {
    return log.errorStack;
  }

  const summary = log.metrics?.summary;
  if (
    summary &&
    typeof summary === "object" &&
    "message" in summary &&
    typeof summary.message === "string"
  ) {
    return summary.message;
  }

  return undefined;
}

export {
  computePipeline,
  computeApi,
  buildFeedAlerts,
  buildActivity,
  buildArticles
};

