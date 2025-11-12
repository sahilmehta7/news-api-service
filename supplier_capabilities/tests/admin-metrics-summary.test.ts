import { describe, expect, it } from "vitest";

import {
  parsePrometheus,
  summarizeApi,
  summarizeWorker
} from "../../apps/admin/src/lib/metrics/summary";

describe("metrics summary helpers", () => {
  const workerMetricsText = `
# HELP news_worker_ingestion_attempts_total Number of ingestion attempts grouped by status
news_worker_ingestion_attempts_total{feed_id="feed-a",status="success"} 6
news_worker_ingestion_attempts_total{feed_id="feed-b",status="success"} 3
news_worker_ingestion_attempts_total{feed_id="feed-b",status="failure"} 1
news_worker_enrichment_attempts_total{status="success"} 8
news_worker_enrichment_attempts_total{status="failure"} 2
news_worker_enrichment_queue_size 4
news_worker_ingestion_articles_total{feed_id="feed-a"} 12
news_worker_ingestion_articles_total{feed_id="feed-b"} 4
`;

  const apiMetricsText = `
# HELP news_api_http_requests_total Total number of HTTP requests
news_api_http_requests_total{method="GET",route="/feeds",status_code="200"} 25
news_api_http_requests_total{method="GET",route="/feeds",status_code="500"} 1
news_api_http_requests_total{method="GET",route="/articles",status_code="200"} 40
news_api_http_request_duration_seconds_sum 3.5
news_api_http_request_duration_seconds_count 70
`;

  it("parses worker metrics and computes ingestion/enrichment summaries", () => {
    const samples = parsePrometheus(workerMetricsText);
    expect(samples).toHaveLength(8);

    const summary = summarizeWorker(samples);
    expect(summary.queueSize).toBe(4);
    expect(summary.ingestionByStatus.success).toBe(9);
    expect(summary.ingestionByStatus.failure).toBe(1);
    expect(summary.enrichmentByStatus.success).toBe(8);
    expect(summary.enrichmentByStatus.failure).toBe(2);
    expect(summary.topFeeds).toEqual([
      { feedId: "feed-a", articles: 12 },
      { feedId: "feed-b", articles: 4 }
    ]);
  });

  it("summarizes API metrics with error rate and latency", () => {
    const samples = parsePrometheus(apiMetricsText);
    const summary = summarizeApi(samples);

    expect(summary.totalRequests).toBe(66);
    expect(summary.errorRate).toBeCloseTo(1 / 66, 5);
    expect(summary.avgLatencyMs).toBeCloseTo((3.5 / 70) * 1000, 5);
    expect(summary.routes).toEqual([
      {
        route: "/articles",
        total: 40,
        errorRate: 0
      },
      {
        route: "/feeds",
        total: 26,
        errorRate: 1 / 26
      }
    ]);
  });
});

