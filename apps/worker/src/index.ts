import Fastify from "fastify";
import { disconnectPrisma } from "@news-api/db";

import { createWorkerContext, type WorkerContext } from "./context.js";
import { startIngestionScheduler } from "./jobs/ingest-feeds.js";
import { startEnrichmentScheduler } from "./jobs/enrich-articles.js";
import { workerMetrics } from "./metrics/registry.js";

async function main() {
  const context = createWorkerContext();

  context.logger.info(
    {
      ingestionConcurrency: context.config.ingestion.concurrency,
      enrichmentConcurrency: context.config.enrichment.concurrency
    },
    "Worker service bootstrap complete"
  );

  workerMetrics.enrichmentQueueSize.set(context.enrichmentQueue.size);

  const ingestionScheduler = startIngestionScheduler(context);
  const enrichmentScheduler = startEnrichmentScheduler(context);
  const metricsServer = await startMetricsServer(context);

  const shutdown = async (signal?: string) => {
    context.logger.info({ signal }, "Shutting down worker");
    ingestionScheduler.stop();
    enrichmentScheduler.stop();

    if (metricsServer) {
      await metricsServer.close();
    }

    await Promise.all([
      context.ingestionQueue.onIdle(),
      context.enrichmentQueue.onIdle()
    ]);
    await disconnectPrisma();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  process.on("unhandledRejection", (reason) => {
    context.logger.error({ reason }, "Unhandled rejection");
  });

  process.on("uncaughtException", (error) => {
    context.logger.error({ error }, "Uncaught exception");
  });
}

void main();

async function startMetricsServer(context: WorkerContext) {
  if (!context.config.monitoring.enabled) {
    context.logger.info("Metrics server disabled via configuration");
    return null;
  }

  const server = Fastify({ logger: false });

  server.get("/metrics", async (_request, reply) => {
    reply.header("Content-Type", workerMetrics.registry.contentType);
    return workerMetrics.registry.metrics();
  });

  await server.listen({
    port: context.config.monitoring.metricsPort,
    host: context.config.monitoring.metricsHost
  });

  context.logger.info(
    {
      port: context.config.monitoring.metricsPort,
      host: context.config.monitoring.metricsHost
    },
    "Metrics endpoint listening"
  );

  return server;
}

