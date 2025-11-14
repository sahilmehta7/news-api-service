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

const searchIndexDocs = new Counter({
  name: "news_search_index_docs_total",
  help: "Number of documents indexed to Elasticsearch",
  registers: [registry],
  labelNames: ["status"]
});

const searchIndexDuration = new Histogram({
  name: "news_search_index_duration_seconds",
  help: "Duration of Elasticsearch indexing operations in seconds",
  registers: [registry]
});

const searchKnnQueries = new Counter({
  name: "news_search_knn_queries_total",
  help: "Number of k-NN queries executed",
  registers: [registry]
});

const searchKnnQueryDuration = new Histogram({
  name: "news_search_knn_query_duration_seconds",
  help: "Duration of k-NN queries in seconds",
  registers: [registry]
});

const searchClusters = new Counter({
  name: "news_search_clusters_total",
  help: "Number of cluster operations",
  registers: [registry],
  labelNames: ["action"]
});

const searchClusterDuration = new Histogram({
  name: "news_search_cluster_duration_seconds",
  help: "Duration of clustering operations in seconds",
  registers: [registry]
});

const embeddingRequests = new Counter({
  name: "news_embedding_requests_total",
  help: "Number of embedding requests",
  registers: [registry],
  labelNames: ["provider", "status"]
});

const embeddingDuration = new Histogram({
  name: "news_embedding_duration_seconds",
  help: "Duration of embedding computation in seconds",
  registers: [registry],
  labelNames: ["provider"]
});

const embeddingCircuitBreakerState = new Gauge({
  name: "news_embedding_circuit_breaker_state",
  help: "Circuit breaker state (0=closed, 1=half-open, 2=open)",
  registers: [registry],
  labelNames: ["provider"]
});

const embeddingRetries = new Counter({
  name: "news_embedding_retries_total",
  help: "Number of embedding request retries",
  registers: [registry],
  labelNames: ["provider"]
});

export const workerMetrics = {
  registry,
  ingestionDuration,
  ingestionArticles,
  ingestionAttempts,
  enrichmentDuration,
  enrichmentAttempts,
  enrichmentQueueSize,
  searchIndexDocs,
  searchIndexDuration,
  searchKnnQueries,
  searchKnnQueryDuration,
  searchClusters,
  searchClusterDuration,
  embeddingRequests,
  embeddingDuration,
  embeddingCircuitBreakerState,
  embeddingRetries
};

