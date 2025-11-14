#!/usr/bin/env tsx

/**
 * Quick verification script for story maintenance setup
 * Checks prerequisites without running full tests
 */

import { loadConfig } from "@news-api/config";
import { prisma } from "@news-api/db";
import { createElasticsearchClient, checkElasticsearchHealth } from "@news-api/search";
import { createLogger } from "@news-api/logger";

const logger = createLogger({ name: "verify-setup" });

async function main() {
  console.log("\n🔍 Verifying Story Maintenance Setup...\n");

  const config = loadConfig();

  // Check 1: Search enabled
  console.log("1. Checking search configuration...");
  if (!config.search.enabled) {
    console.log("   ⚠️  SEARCH_ENABLED=false");
    console.log("   → Set SEARCH_ENABLED=true in .env to enable story maintenance\n");
  } else {
    console.log("   ✅ SEARCH_ENABLED=true\n");
  }

  // Check 2: Elasticsearch connection
  console.log("2. Checking Elasticsearch connection...");
  const client = createElasticsearchClient(config);
  if (!client) {
    console.log("   ⚠️  Elasticsearch client not created");
    console.log("   → Check ELASTICSEARCH_NODE in .env\n");
  } else {
    try {
      const health = await checkElasticsearchHealth(client);
      if (health.status === "ok") {
        console.log("   ✅ Elasticsearch is accessible\n");
      } else {
        console.log(`   ⚠️  Elasticsearch status: ${health.status}\n`);
      }
    } catch (error) {
      console.log("   ❌ Cannot connect to Elasticsearch");
      console.log(`   → Error: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  // Check 3: Database articles
  console.log("3. Checking database...");
  try {
    const totalArticles = await prisma.article.count();
    const articlesWithStoryIds = await prisma.article.count({
      where: { storyId: { not: null } }
    });

    console.log(`   📊 Total articles: ${totalArticles}`);
    console.log(`   📊 Articles with storyIds: ${articlesWithStoryIds}`);

    if (articlesWithStoryIds === 0) {
      console.log("   ⚠️  No articles have storyIds assigned");
      console.log("   → Run: npm run search:backfill -- --fromDays 1\n");
    } else {
      console.log("   ✅ Articles with storyIds found\n");

      // Check story distribution
      const storyCounts = await prisma.article.groupBy({
        by: ["storyId"],
        where: { storyId: { not: null } },
        _count: { id: true }
      });

      const multiArticleStories = storyCounts.filter((s) => s._count.id > 1).length;
      console.log(`   📊 Stories with multiple articles: ${multiArticleStories}`);
    }
  } catch (error) {
    console.log("   ❌ Database query failed");
    console.log(`   → Error: ${error instanceof Error ? error.message : String(error)}\n`);
  }

  // Check 4: Worker files
  console.log("4. Checking implementation files...");
  const fs = await import("fs/promises");
  const files = [
    "apps/worker/src/lib/search/story-maintenance.ts",
    "apps/worker/src/lib/search/story-queue.ts"
  ];

  for (const file of files) {
    try {
      await fs.access(file);
      console.log(`   ✅ ${file}`);
    } catch {
      console.log(`   ❌ ${file} not found`);
    }
  }
  console.log();

  // Summary
  console.log("📋 Summary:");
  console.log("   → To test: npm run test:runtime-story");
  console.log("   → To start worker: npm run dev --workspace @news-api/worker");
  console.log("   → To backfill: npm run search:backfill -- --fromDays 1\n");

  await prisma.$disconnect();
}

void main().catch((error) => {
  console.error("Verification failed:", error);
  process.exit(1);
});

