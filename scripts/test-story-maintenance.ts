#!/usr/bin/env tsx

/**
 * Test script for Phase 2: Story Maintenance
 * 
 * This script tests:
 * 1. Story metadata computation
 * 2. Story queue functionality
 * 3. Integration with worker context
 */

import { loadConfig } from "@news-api/config";
import { prisma } from "@news-api/db";
import { createElasticsearchClient, bootstrapIndices } from "@news-api/search";
import { createLogger } from "@news-api/logger";
import { computeStoryMetadata, batchUpdateStories } from "../apps/worker/src/lib/search/story-maintenance.js";
import { StoryUpdateQueue } from "../apps/worker/src/lib/search/story-queue.js";

const logger = createLogger({ name: "test-story-maintenance" });

async function main() {
  const config = loadConfig();

  if (!config.search.enabled) {
    logger.warn("Search is disabled. Set SEARCH_ENABLED=true to test story maintenance.");
    logger.info("Continuing with limited testing...");
  }

  const searchClient = createElasticsearchClient(config);

  if (searchClient) {
    await bootstrapIndices(searchClient, config);
    logger.info("Elasticsearch indices bootstrapped");
  } else {
    logger.warn("Elasticsearch client not available, skipping ES operations");
  }

  // Test 1: Find a story with articles
  logger.info("Test 1: Finding stories with articles...");
  const storiesWithArticlesRaw = await prisma.article.groupBy({
    by: ["storyId"],
    where: {
      storyId: { not: null }
    },
    _count: {
      id: true
    },
    having: {
      id: {
        _count: {
          gt: 1 // At least 2 articles
        }
      }
    }
  });
  
  // Sort and take top 5 manually (Prisma groupBy with take requires orderBy which has type issues)
  const storiesWithArticles = storiesWithArticlesRaw
    .sort((a, b) => (b._count.id ?? 0) - (a._count.id ?? 0))
    .slice(0, 5);

  if (storiesWithArticles.length === 0) {
    logger.warn("No stories with multiple articles found. Creating test scenario...");
    
    // Find articles that could be in the same story
    const recentArticles = await prisma.article.findMany({
      where: {
        publishedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        }
      },
      take: 10,
      select: {
        id: true,
        title: true,
        storyId: true
      }
    });

    logger.info({ count: recentArticles.length }, "Found recent articles");
    
    if (recentArticles.length === 0) {
      logger.error("No articles found in database. Please run ingestion first.");
      await prisma.$disconnect();
      process.exit(1);
    }

    logger.info("To test story maintenance, you need articles with storyIds assigned.");
    logger.info("Run the worker or backfill script to assign storyIds first.");
    await prisma.$disconnect();
    process.exit(0);
  }

  logger.info({ count: storiesWithArticles.length }, "Found stories with multiple articles");

  // Test 2: Compute story metadata
  if (searchClient && storiesWithArticles.length > 0) {
    const firstStory = storiesWithArticles[0];
    if (!firstStory || !firstStory.storyId) {
      logger.warn("No valid story ID found in first story");
      return;
    }
    const testStoryId = firstStory.storyId;
    logger.info({ storyId: testStoryId }, "Test 2: Computing story metadata...");

    try {
      const storyDoc = await computeStoryMetadata(
        prisma,
        testStoryId,
        searchClient,
        config
      );

      if (storyDoc) {
        logger.info({
          story_id: storyDoc.story_id,
          title_rep: storyDoc.title_rep,
          summary: storyDoc.summary?.substring(0, 100) + "...",
          keywords: storyDoc.keywords,
          sources: storyDoc.sources,
          time_range_start: storyDoc.time_range_start,
          time_range_end: storyDoc.time_range_end,
          has_centroid: !!storyDoc.centroid_embedding
        }, "Story metadata computed successfully");

        // Test 3: Update story index
        logger.info("Test 3: Updating story in index...");
        await batchUpdateStories(searchClient, config, [storyDoc], prisma);
        logger.info("Story updated in Elasticsearch and PostgreSQL");

        // Verify it was indexed
        const { getStoriesIndexName } = await import("@news-api/search");
        const storiesIndex = getStoriesIndexName(config);
        const getResponse = await searchClient.get({
          index: storiesIndex,
          id: testStoryId
        });

        if (getResponse.found) {
          logger.info("✓ Story document verified in Elasticsearch");
        } else {
          logger.warn("Story document not found in index (may need refresh)");
        }
      } else {
        logger.warn("Story metadata computation returned null");
      }
    } catch (error) {
      logger.error({ error }, "Failed to compute/update story metadata");
    }
  }

  // Test 4: Story queue functionality
  logger.info("Test 4: Testing story queue...");
  const storyQueue = new StoryUpdateQueue(prisma, searchClient, config);

  // Enqueue a few stories
  for (const story of storiesWithArticles.slice(0, 3)) {
    const storyId = story.storyId;
    if (storyId) {
      storyQueue.enqueue(storyId);
      logger.debug({ storyId }, "Enqueued story for update");
    }
  }

  logger.info("Stories enqueued. Queue will process after debounce period or batch size.");
  logger.info("For immediate processing, call storyQueue.flush()");

  // Force flush for testing
  if (searchClient) {
    logger.info("Force flushing queue for testing...");
    await storyQueue.flush();
    logger.info("✓ Queue flushed successfully");
  }

  // Cleanup
  await storyQueue.close();
  await prisma.$disconnect();

  logger.info("All tests completed!");
}

void main().catch((error) => {
  logger.error({ error }, "Test script failed");
  process.exit(1);
});

