import type { Client } from "@elastic/elasticsearch";
import type { AppConfig } from "@news-api/config";
import type { ArticleDocument } from "@news-api/search";
import { getArticlesIndexName } from "@news-api/search";
import { createLogger } from "@news-api/logger";
import { workerMetrics } from "../../metrics/registry.js";

const logger = createLogger({ name: "search-indexing" });

const BATCH_SIZE = 500;
const MAX_BATCH_BYTES = 5 * 1024 * 1024;

export interface IndexQueueItem {
  document: ArticleDocument;
  retries: number;
}

export class BulkIndexQueue {
  private queue: IndexQueueItem[] = [];
  private client: Client | null;
  private config: AppConfig;
  private maxRetries: number;
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(
    client: Client | null,
    config: AppConfig,
    maxRetries = 3
  ) {
    this.client = client;
    this.config = config;
    this.maxRetries = maxRetries;
  }

  add(document: ArticleDocument): void {
    if (!this.client) {
      logger.debug("Search disabled, skipping index");
      return;
    }

    this.queue.push({ document, retries: 0 });

    if (this.queue.length >= BATCH_SIZE) {
      void this.flush();
    } else if (!this.flushInterval) {
      this.flushInterval = setTimeout(() => {
        this.flushInterval = null;
        void this.flush();
      }, 5000);
    }
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0 || !this.client) {
      return;
    }

    const batch = this.queue.splice(0, BATCH_SIZE);
    if (this.flushInterval) {
      clearTimeout(this.flushInterval);
      this.flushInterval = null;
    }

    const indexName = getArticlesIndexName(this.config);
    const operations: Array<{ index: { _index: string; _id: string } } | ArticleDocument> = [];

    for (const item of batch) {
      operations.push({
        index: {
          _index: indexName,
          _id: item.document.id
        }
      });
      operations.push(item.document);
    }

    const timer = workerMetrics.searchIndexDuration.startTimer();

    try {
      const response = await this.client.bulk({
        operations,
        timeout: "30s"
      });

      timer();

      if (response.errors) {
        const failed: IndexQueueItem[] = [];
        for (let i = 0; i < response.items.length; i++) {
          const item = response.items[i];
          if ("index" in item && item.index?.error) {
            const queueItem = batch[i];
            if (queueItem && queueItem.retries < this.maxRetries) {
              queueItem.retries++;
              failed.push(queueItem);
            } else if (queueItem) {
              logger.error(
                {
                  articleId: queueItem.document.id,
                  error: item.index.error
                },
                "Failed to index article after retries"
              );
              workerMetrics.searchIndexDocs.inc({ status: "failure" });
            }
          } else if ("index" in item && item.index) {
            workerMetrics.searchIndexDocs.inc({ status: "success" });
          }
        }
        this.queue.push(...failed);
      } else {
        logger.debug(
          { count: batch.length },
          "Successfully indexed articles batch"
        );
        for (let i = 0; i < batch.length; i++) {
          workerMetrics.searchIndexDocs.inc({ status: "success" });
        }
      }
    } catch (error) {
      timer();
      logger.error({ error }, "Bulk index failed, requeuing batch");
      const requeued = batch.filter((item) => item.retries < this.maxRetries);
      for (const item of requeued) {
        item.retries++;
      }
      this.queue.push(...requeued);
    }
  }

  async close(): Promise<void> {
    if (this.flushInterval) {
      clearTimeout(this.flushInterval);
      this.flushInterval = null;
    }
    await this.flush();
  }
}

