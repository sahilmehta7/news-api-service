import type { Client } from "@elastic/elasticsearch";
import type { AppConfig } from "@news-api/config";
import type { PrismaClientType } from "@news-api/db";
import { createLogger } from "@news-api/logger";
import type { StoryDocument } from "@news-api/search";
import {
  computeStoryMetadata,
  batchUpdateStories
} from "./story-maintenance.js";

const logger = createLogger({ name: "story-queue" });

const UPDATE_DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes
const BATCH_SIZE = 50;

/**
 * Queue for debouncing and batching story index updates
 */
export class StoryUpdateQueue {
  private pendingStoryIds = new Set<string>();
  private updateTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    private readonly db: PrismaClientType,
    private readonly searchClient: Client | null,
    private readonly config: AppConfig
  ) {}

  /**
   * Queue a story for update
   */
  enqueue(storyId: string): void {
    if (!this.searchClient || !storyId) {
      return;
    }

    this.pendingStoryIds.add(storyId);

    // Clear existing timer
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }

    // Set new timer for debounced update
    this.updateTimer = setTimeout(() => {
      void this.flush();
    }, UPDATE_DEBOUNCE_MS);

    // Also flush if we've reached batch size
    if (this.pendingStoryIds.size >= BATCH_SIZE) {
      if (this.updateTimer) {
        clearTimeout(this.updateTimer);
        this.updateTimer = null;
      }
      void this.flush();
    }
  }

  /**
   * Process all pending story updates
   */
  async flush(): Promise<void> {
    if (this.isProcessing || this.pendingStoryIds.size === 0 || !this.searchClient) {
      return;
    }

    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }

    this.isProcessing = true;
    const storyIds = Array.from(this.pendingStoryIds);
    this.pendingStoryIds.clear();

    try {
      logger.debug({ count: storyIds.length }, "Processing story updates");

      const storyDocs: StoryDocument[] = [];

      // Compute metadata for each story
      for (const storyId of storyIds) {
        try {
          const storyDoc = await computeStoryMetadata(
            this.db,
            storyId,
            this.searchClient,
            this.config
          );

          if (storyDoc) {
            storyDocs.push(storyDoc);
          }
        } catch (error) {
          logger.error({ error, storyId }, "Failed to compute story metadata");
        }
      }

      // Batch update to Elasticsearch and PostgreSQL
      if (storyDocs.length > 0) {
        await batchUpdateStories(this.searchClient, this.config, storyDocs, this.db);
        logger.info({ count: storyDocs.length }, "Updated stories in index");
      }
    } catch (error) {
      logger.error({ error }, "Failed to flush story updates");
      // Re-queue failed story IDs
      for (const storyId of storyIds) {
        this.pendingStoryIds.add(storyId);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Force immediate flush and wait for completion
   */
  async close(): Promise<void> {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
    await this.flush();
  }
}

