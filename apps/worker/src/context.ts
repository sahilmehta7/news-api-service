import PQueue from "p-queue";
import type { Client } from "@elastic/elasticsearch";

import { createLogger } from "@news-api/logger";
import { loadConfig, type AppConfig } from "@news-api/config";
import { prisma, type PrismaClientType } from "@news-api/db";
import { createElasticsearchClient } from "@news-api/search";
import type { BulkIndexQueue } from "./lib/search/indexing.js";
import type { EmbeddingProvider } from "./lib/embeddings/provider.js";
import type { StoryUpdateQueue } from "./lib/search/story-queue.js";

export type WorkerContext = {
  config: AppConfig;
  logger: ReturnType<typeof createLogger>;
  db: PrismaClientType;
  ingestionQueue: PQueue;
  enrichmentQueue: PQueue;
  searchClient: Client | null;
  indexQueue: BulkIndexQueue;
  embeddingProvider: EmbeddingProvider;
  storyQueue: StoryUpdateQueue;
};

export async function createWorkerContext(): Promise<WorkerContext> {
  const config = loadConfig();
  const logger = createLogger({ name: "worker" });

  const ingestionQueue = new PQueue({
    concurrency: config.ingestion.concurrency
  });
  const enrichmentQueue = new PQueue({
    concurrency: config.enrichment.concurrency
  });

  const searchClient = createElasticsearchClient(config);

  const { BulkIndexQueue } = await import("./lib/search/indexing.js");
  const indexQueue = new BulkIndexQueue(searchClient, config);

  const { createEmbeddingProvider } = await import("./lib/embeddings/index.js");
  const embeddingProvider = await createEmbeddingProvider();

  const { StoryUpdateQueue } = await import("./lib/search/story-queue.js");
  const storyQueue = new StoryUpdateQueue(prisma, searchClient, config);

  return {
    config,
    logger,
    db: prisma,
    ingestionQueue,
    enrichmentQueue,
    searchClient,
    indexQueue,
    embeddingProvider,
    storyQueue
  };
}

