import useSWR from "swr";

import { API_METRICS_URL, WORKER_METRICS_URL } from "@/lib/env";

type PromSample = {
  metric: string;
  labels: Record<string, string>;
  value: number;
};

export type MetricsSummary = {
  worker: {
    queueSize: number;
    ingestionByStatus: Record<string, number>;
    enrichmentByStatus: Record<string, number>;
    topFeeds: Array<{ feedId: string; articles: number }>;
  };
  api: {
    totalRequests: number;
    errorRate: number;
    avgLatencyMs: number | null;
    routes: Array<{ route: string; total: number; errorRate: number }>;
  };
  updatedAt: string;
};

export function useMetricsSummary() {
  return useSWR<MetricsSummary>(
    "metrics-summary",
    fetchMetricsSummary,
    {
      refreshInterval: 30_000,
      revalidateOnFocus: false
    }
  );
}

async function fetchMetricsSummary(): Promise<MetricsSummary> {
  const [apiMetrics, workerMetrics] = await Promise.all([
    fetchPrometheus(API_METRICS_URL),
    fetchPrometheus(WORKER_METRICS_URL)
  ]);

  const summary: MetricsSummary = {
    worker: summarizeWorker(workerMetrics),
    api: summarizeApi(apiMetrics),
    updatedAt: new Date().toISOString()
  };

  return summary;
}

async function fetchPrometheus(url: string): Promise<PromSample[]> {
  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/plain"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch metrics from ${url}`);
    }

    const text = await response.text();
    return parsePrometheus(text);
  } catch (error) {
    console.warn("Metrics fetch failed", { url, error });
    return [];
  }
}

function parsePrometheus(input: string): PromSample[] {
  const samples: PromSample[] = [];
  const lines = input.split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{([^}]*)\})?\s+([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)$/);
    if (!match) {
      continue;
    }

    const [, metric, , labelString, valueString] = match;
    const labels: Record<string, string> = {};

    if (labelString) {
      const labelRegex = /([a-zA-Z_][a-zA-Z0-9_]*)="([^"]*)"/g;
      let labelMatch: RegExpExecArray | null;
      while ((labelMatch = labelRegex.exec(labelString)) !== null) {
        labels[labelMatch[1]] = labelMatch[2];
      }
    }

    const value = Number(valueString);
    if (Number.isNaN(value)) {
      continue;
    }

    samples.push({ metric, labels, value });
  }

  return samples;
}

function summarizeWorker(samples: PromSample[]) {
  const ingestionByStatus: Record<string, number> = {};
  const enrichmentByStatus: Record<string, number> = {};
  const feedArticles: Record<string, number> = {};
  let queueSize = 0;

  for (const sample of samples) {
    if (sample.metric === "news_worker_ingestion_attempts_total") {
      const status = sample.labels.status ?? "unknown";
      ingestionByStatus[status] = (ingestionByStatus[status] ?? 0) + sample.value;
    }

    if (sample.metric === "news_worker_enrichment_attempts_total") {
      const status = sample.labels.status ?? "unknown";
      enrichmentByStatus[status] = (enrichmentByStatus[status] ?? 0) + sample.value;
    }

    if (sample.metric === "news_worker_ingestion_articles_total") {
      const feedId = sample.labels.feed_id ?? "unknown";
      feedArticles[feedId] = sample.value;
    }

    if (sample.metric === "news_worker_enrichment_queue_size") {
      queueSize = sample.value;
    }
  }

  const topFeeds = Object.entries(feedArticles)
    .map(([feedId, articles]) => ({ feedId, articles }))
    .sort((a, b) => b.articles - a.articles)
    .slice(0, 5);

  return {
    queueSize,
    ingestionByStatus,
    enrichmentByStatus,
    topFeeds
  };
}

function summarizeApi(samples: PromSample[]) {
  const routeStats = new Map<
    string,
    { total: number; errors: number }
  >();
  let totalRequests = 0;
  let errorCount = 0;
  let latencySum = 0;
  let latencyCount = 0;

  for (const sample of samples) {
    if (sample.metric === "news_api_http_requests_total") {
      const route = sample.labels.route ?? "unknown";
      const statusCode = Number(sample.labels.status_code ?? "0");
      const current = routeStats.get(route) ?? { total: 0, errors: 0 };
      current.total += sample.value;
      if (!Number.isNaN(statusCode) && statusCode >= 400) {
        current.errors += sample.value;
        errorCount += sample.value;
      }
      routeStats.set(route, current);
      totalRequests += sample.value;
    }

    if (sample.metric.startsWith("news_api_http_request_duration_seconds_sum")) {
      latencySum += sample.value;
    }

    if (sample.metric.startsWith("news_api_http_request_duration_seconds_count")) {
      latencyCount += sample.value;
    }
  }

  const routes = Array.from(routeStats.entries())
    .map(([route, stats]) => ({
      route,
      total: stats.total,
      errorRate: stats.total > 0 ? stats.errors / stats.total : 0
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  return {
    totalRequests,
    errorRate: totalRequests > 0 ? errorCount / totalRequests : 0,
    avgLatencyMs: latencyCount > 0 ? (latencySum / latencyCount) * 1000 : null,
    routes
  };
}

export { parsePrometheus, summarizeWorker, summarizeApi };

