import PQueue from "p-queue";

import { createLogger } from "@news-api/logger";
import { loadConfig, type AppConfig } from "@news-api/config";
import { prisma, type PrismaClientType } from "@news-api/db";

export type WorkerContext = {
  config: AppConfig;
  logger: ReturnType<typeof createLogger>;
  db: PrismaClientType;
  ingestionQueue: PQueue;
  enrichmentQueue: PQueue;
};

export function createWorkerContext(): WorkerContext {
  const config = loadConfig();
  const logger = createLogger({ name: "worker" });

  const ingestionQueue = new PQueue({
    concurrency: config.ingestion.concurrency
  });
  const enrichmentQueue = new PQueue({
    concurrency: config.enrichment.concurrency
  });

  return {
    config,
    logger,
    db: prisma,
    ingestionQueue,
    enrichmentQueue
  };
}

