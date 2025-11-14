#!/usr/bin/env tsx
/**
 * Performance benchmark script for search functionality
 * 
 * Usage:
 *   npm run benchmark:search
 * 
 * Metrics:
 *   - Query latency (p50, p95, p99)
 *   - Indexing throughput
 *   - Clustering performance
 *   - Memory usage
 */

import { createLogger } from "@news-api/logger";
import { loadConfig } from "@news-api/config";
import { createElasticsearchClient, getArticlesIndexName } from "@news-api/search";

const logger = createLogger({ name: "benchmark" });

interface BenchmarkResult {
  operation: string;
  count: number;
  totalTime: number;
  avgTime: number;
  p50: number;
  p95: number;
  p99: number;
  errors: number;
}

function calculatePercentile(times: number[], percentile: number): number {
  const sorted = [...times].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}

async function benchmarkSearchQueries(
  client: ReturnType<typeof createElasticsearchClient>,
  config: ReturnType<typeof loadConfig>,
  iterations: number
): Promise<BenchmarkResult> {
  const indexName = getArticlesIndexName(config);
  const times: number[] = [];
  let errors = 0;

  logger.info({ iterations }, "Starting search query benchmark");

  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    try {
      await client?.search({
        index: indexName,
        size: 20,
        query: {
          match_all: {}
        }
      });
      const duration = Date.now() - start;
      times.push(duration);
    } catch (error) {
      errors++;
      logger.error({ error, iteration: i }, "Search query failed");
    }
  }

  const totalTime = times.reduce((sum, t) => sum + t, 0);
  const avgTime = totalTime / times.length;
  const p50 = calculatePercentile(times, 50);
  const p95 = calculatePercentile(times, 95);
  const p99 = calculatePercentile(times, 99);

  return {
    operation: "search_query",
    count: iterations,
    totalTime,
    avgTime,
    p50,
    p95,
    p99,
    errors
  };
}

async function benchmarkKnnQueries(
  client: ReturnType<typeof createElasticsearchClient>,
  config: ReturnType<typeof loadConfig>,
  iterations: number
): Promise<BenchmarkResult> {
  const indexName = getArticlesIndexName(config);
  const times: number[] = [];
  let errors = 0;

  // Generate a dummy embedding vector (384 dimensions)
  const dummyEmbedding = Array.from({ length: 384 }, () => Math.random());

  logger.info({ iterations }, "Starting k-NN query benchmark");

  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    try {
      await client?.search({
        index: indexName,
        size: 20,
        knn: {
          field: "embedding",
          query_vector: dummyEmbedding,
          k: 20,
          num_candidates: 100
        }
      });
      const duration = Date.now() - start;
      times.push(duration);
    } catch (error) {
      errors++;
      logger.error({ error, iteration: i }, "k-NN query failed");
    }
  }

  const totalTime = times.reduce((sum, t) => sum + t, 0);
  const avgTime = totalTime / times.length;
  const p50 = calculatePercentile(times, 50);
  const p95 = calculatePercentile(times, 95);
  const p99 = calculatePercentile(times, 99);

  return {
    operation: "knn_query",
    count: iterations,
    totalTime,
    avgTime,
    p50,
    p95,
    p99,
    errors
  };
}

function printResults(results: BenchmarkResult[]): void {
  console.log("\n=== Benchmark Results ===\n");

  for (const result of results) {
    console.log(`Operation: ${result.operation}`);
    console.log(`  Iterations: ${result.count}`);
    console.log(`  Total Time: ${result.totalTime.toFixed(2)}ms`);
    console.log(`  Average: ${result.avgTime.toFixed(2)}ms`);
    console.log(`  p50: ${result.p50.toFixed(2)}ms`);
    console.log(`  p95: ${result.p95.toFixed(2)}ms`);
    console.log(`  p99: ${result.p99.toFixed(2)}ms`);
    console.log(`  Errors: ${result.errors}`);
    console.log(`  Throughput: ${((result.count / result.totalTime) * 1000).toFixed(2)} ops/sec`);
    console.log("");
  }
}

async function main() {
  const config = loadConfig();

  if (!config.search.enabled) {
    logger.warn("Search is disabled. Enable SEARCH_ENABLED=true to run benchmarks.");
    process.exit(1);
  }

  const client = createElasticsearchClient(config);
  if (!client) {
    logger.error("Failed to create Elasticsearch client");
    process.exit(1);
  }

  const iterations = parseInt(process.env.BENCHMARK_ITERATIONS || "100", 10);

  logger.info({ iterations }, "Starting search benchmarks");

  const results: BenchmarkResult[] = [];

  // Benchmark search queries
  try {
    const searchResult = await benchmarkSearchQueries(client, config, iterations);
    results.push(searchResult);
  } catch (error) {
    logger.error({ error }, "Search query benchmark failed");
  }

  // Benchmark k-NN queries
  try {
    const knnResult = await benchmarkKnnQueries(client, config, iterations);
    results.push(knnResult);
  } catch (error) {
    logger.error({ error }, "k-NN query benchmark failed");
  }

  printResults(results);

  // Memory usage
  const memUsage = process.memoryUsage();
  console.log("=== Memory Usage ===");
  console.log(`  RSS: ${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Heap Used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Heap Total: ${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  External: ${(memUsage.external / 1024 / 1024).toFixed(2)} MB`);
  console.log("");

  process.exit(0);
}

void main();

