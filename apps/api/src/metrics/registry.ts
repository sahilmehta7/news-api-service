import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics
} from "prom-client";

const registry = new Registry();

collectDefaultMetrics({
  prefix: "news_api_",
  register: registry
});

const httpRequestDuration = new Histogram({
  name: "news_api_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  registers: [registry],
  labelNames: ["method", "route", "status_code"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5]
});

const httpRequestCounter = new Counter({
  name: "news_api_http_requests_total",
  help: "Total number of HTTP requests",
  registers: [registry],
  labelNames: ["method", "route", "status_code"]
});

// Search-specific metrics
const searchQueryDuration = new Histogram({
  name: "news_api_search_query_duration_seconds",
  help: "Search query duration in seconds",
  registers: [registry],
  labelNames: ["route"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2]
});

const searchZeroResults = new Counter({
  name: "news_api_search_zero_results_total",
  help: "Total number of searches returning zero results",
  registers: [registry],
  labelNames: ["route"]
});

const searchRerankerDuration = new Histogram({
  name: "news_api_search_reranker_duration_seconds",
  help: "Reranker duration in seconds",
  registers: [registry],
  buckets: [0.005, 0.01, 0.02, 0.05, 0.1, 0.25, 0.5]
});

const searchRerankerApplied = new Counter({
  name: "news_api_search_reranker_applied_total",
  help: "Number of searches where reranker was applied",
  registers: [registry]
});

const searchDuplicatesCollapsed = new Counter({
  name: "news_api_search_duplicates_collapsed_total",
  help: "Number of duplicates collapsed across results",
  registers: [registry]
});

export const metrics = {
  registry,
  httpRequestDuration,
  httpRequestCounter,
  searchQueryDuration,
  searchZeroResults,
  searchRerankerDuration,
  searchRerankerApplied,
  searchDuplicatesCollapsed
};

