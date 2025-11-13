import { describe, expect, it } from "vitest";

import {
  buildActivity,
  buildArticles,
  buildFeedAlerts,
  computeApi,
  computePipeline
} from "@/lib/dashboard/get-dashboard-snapshot";
import type { MetricsSummary } from "@/lib/metrics/summary";
import type { Feed, LogEntry } from "@/lib/api/types";

describe("dashboard snapshot helpers", () => {
  const metrics: MetricsSummary = {
    worker: {
      queueSize: 12,
      ingestionByStatus: {
        success: 80,
        failed: 20
      },
      enrichmentByStatus: {
        success: 60,
        failed: 40
      },
      topFeeds: []
    },
    api: {
      totalRequests: 1200,
      errorRate: 0.05,
      avgLatencyMs: 120,
      routes: [
        { route: "/articles", total: 400, errorRate: 0.1 },
        { route: "/feeds", total: 200, errorRate: 0.02 }
      ]
    },
    updatedAt: new Date().toISOString()
  };

  it("computes pipeline ratios from metrics", () => {
    const pipeline = computePipeline(metrics);
    expect(pipeline.queueSize).toBe(12);
    expect(pipeline.ingestionSuccessRate).toBeCloseTo(0.8);
    expect(pipeline.ingestionFailureRate).toBeCloseTo(0.2);
    expect(pipeline.enrichmentSuccessRate).toBeCloseTo(0.6);
    expect(pipeline.enrichmentFailureRate).toBeCloseTo(0.4);
    expect(pipeline.topFeeds).toEqual([]);
  });

  it("exposes top routes from api metrics", () => {
    const api = computeApi(metrics);
    expect(api.topRoutes).toHaveLength(2);
    expect(api.topRoutes[0]).toMatchObject({ route: "/articles" });
  });

  it("builds feed alerts from warning and error states", () => {
    const feeds: Feed[] = [
      {
        id: "feed-1",
        name: "Daily Tech",
        url: "https://example.com/rss",
        category: "tech",
        tags: [],
        isActive: true,
        fetchIntervalMinutes: 30,
        lastFetchStatus: "warning",
        lastFetchAt: new Date().toISOString(),
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        stats: {
          articleCount: 10,
          lastArticlePublishedAt: new Date().toISOString()
        }
      },
      {
        id: "feed-2",
        name: "Finance Weekly",
        url: "https://finance.example.com/rss",
        category: "finance",
        tags: [],
        isActive: true,
        fetchIntervalMinutes: 45,
        lastFetchStatus: "failure",
        lastFetchAt: new Date().toISOString(),
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        stats: {
          articleCount: 5,
          lastArticlePublishedAt: new Date().toISOString()
        }
      },
      {
        id: "feed-3",
        name: "Healthy Living",
        url: "https://health.example.com/rss",
        category: "health",
        tags: [],
        isActive: true,
        fetchIntervalMinutes: 60,
        lastFetchStatus: "success",
        lastFetchAt: new Date().toISOString(),
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        stats: {
          articleCount: 3,
          lastArticlePublishedAt: new Date().toISOString()
        }
      }
    ];

    const alerts = buildFeedAlerts(feeds);
    expect(alerts).toHaveLength(2);
    expect(alerts[0].severity).toBe("warning");
    expect(alerts[1].severity).toBe("error");
  });

  it("maps logs into dashboard activity timeline", () => {
    const logs: LogEntry[] = [
      {
        id: "log-1",
        feedId: "feed-1",
        feedName: "Daily Tech",
        operation: "fetch",
        status: "failure",
        startedAt: "2024-01-01T00:00:00.000Z",
        finishedAt: "2024-01-01T00:01:00.000Z",
        durationMs: 60_000,
        errorMessage: "Timeout",
        errorStack: null,
        metrics: {},
        context: {}
      },
      {
        id: "log-2",
        feedId: null,
        feedName: null,
        operation: "feed_import",
        status: "success",
        startedAt: "2024-01-02T00:00:00.000Z",
        finishedAt: "2024-01-02T00:05:00.000Z",
        durationMs: 300_000,
        errorMessage: null,
        errorStack: null,
        metrics: {},
        context: {}
      }
    ];

    const activity = buildActivity(logs);
    expect(activity).toHaveLength(2);
    expect(activity[0]).toMatchObject({
      status: "error",
      type: "ingestion",
      detail: "Timeout"
    });
    expect(activity[1]).toMatchObject({
      status: "success",
      type: "system"
    });
  });

  it("combines article highlights with worker metrics", () => {
    const articles = buildArticles(
      {
        ingested: 120,
        enriched: 90,
        pendingEnrichment: 5,
        topLanguages: [
          { language: "en", count: 100 },
          { language: "es", count: 20 }
        ]
      },
      metrics
    );

    expect(articles.pendingEnrichment).toBe(12);
    expect(articles.ingested).toBe(120);
    expect(articles.topLanguages[0].language).toBe("en");
  });
});

