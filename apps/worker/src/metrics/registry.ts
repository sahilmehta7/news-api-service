import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics
} from "prom-client";

const registry = new Registry();

collectDefaultMetrics({
  prefix: "news_worker_",
  register: registry
});

const ingestionDuration = new Histogram({
  name: "news_worker_ingestion_duration_seconds",
  help: "Duration of feed ingestion jobs in seconds",
  registers: [registry],
  labelNames: ["feed_id", "status"]
});

const ingestionArticles = new Counter({
  name: "news_worker_ingestion_articles_total",
  help: "Number of articles processed during ingestion",
  registers: [registry],
  labelNames: ["feed_id"]
});

const ingestionAttempts = new Counter({
  name: "news_worker_ingestion_attempts_total",
  help: "Number of ingestion attempts grouped by status",
  registers: [registry],
  labelNames: ["feed_id", "status"]
});

const enrichmentDuration = new Histogram({
  name: "news_worker_enrichment_duration_seconds",
  help: "Duration of article enrichment jobs in seconds",
  registers: [registry],
  labelNames: ["status"]
});

const enrichmentAttempts = new Counter({
  name: "news_worker_enrichment_attempts_total",
  help: "Number of enrichment attempts grouped by status",
  registers: [registry],
  labelNames: ["status"]
});

const enrichmentQueueSize = new Gauge({
  name: "news_worker_enrichment_queue_size",
  help: "Current size of the enrichment queue",
  registers: [registry]
});

export const workerMetrics = {
  registry,
  ingestionDuration,
  ingestionArticles,
  ingestionAttempts,
  enrichmentDuration,
  enrichmentAttempts,
  enrichmentQueueSize
};

