#!/usr/bin/env tsx

import { loadConfig } from "@news-api/config";
import { prisma } from "@news-api/db";
import {
  createElasticsearchClient,
  bootstrapIndices,
  getArticlesIndexName,
  type ArticleDocument,
  type StoryDocument
} from "@news-api/search";
import { createLogger } from "@news-api/logger";
import { createEmbeddingProvider } from "../apps/worker/src/lib/embeddings/index.js";
import { assignStoryId } from "../apps/worker/src/lib/search/clustering.js";
import {
  computeStoryMetadata,
  batchUpdateStories
} from "../apps/worker/src/lib/search/story-maintenance.js";

const logger = createLogger({ name: "backfill" });

interface BackfillOptions {
  fromDays?: number;
  from?: string;
  to?: string;
  batch?: number;
  concurrency?: number;
}

async function main() {
  const args = parseArgs();
  const config = loadConfig();

  if (!config.search.enabled) {
    logger.error("Search is disabled. Set SEARCH_ENABLED=true to run backfill.");
    process.exit(1);
  }

  const client = createElasticsearchClient(config);
  if (!client) {
    logger.error("Failed to create Elasticsearch client");
    process.exit(1);
  }

  await bootstrapIndices(client, config);

  const embeddingProvider = await createEmbeddingProvider();
  const batchSize = args.batch ?? 500;
  const concurrency = args.concurrency ?? 4;

  const windowStart = args.from
    ? new Date(args.from)
    : args.fromDays
      ? new Date(Date.now() - args.fromDays * 24 * 60 * 60 * 1000)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const windowEnd = args.to ? new Date(args.to) : new Date();

  logger.info(
    {
      from: windowStart.toISOString(),
      to: windowEnd.toISOString(),
      batchSize,
      concurrency
    },
    "Starting backfill"
  );

  let processed = 0;
  let indexed = 0;
  let errors = 0;

  const indexName = getArticlesIndexName(config);
  let cursor: string | undefined;

  do {
    const articles = await prisma.article.findMany({
      where: {
        publishedAt: {
          gte: windowStart,
          lte: windowEnd
        },
        id: cursor ? { gt: cursor } : undefined
      },
      include: {
        articleMetadata: true,
        feed: {
          select: {
            name: true
          }
        }
      },
      orderBy: {
        id: "asc"
      },
      take: batchSize
    });

    if (articles.length === 0) {
      break;
    }

    const batch: Array<{ doc: ArticleDocument; articleId: string }> = [];

    for (const article of articles) {
      try {
        const textForEmbedding =
          article.articleMetadata?.contentPlain ??
          article.content ??
          `${article.title} ${article.summary ?? ""}`;

        const embedding = await embeddingProvider.embed(textForEmbedding);

        const articleDoc: ArticleDocument = {
          id: article.id,
          feed_id: article.feedId,
          source_url: article.sourceUrl,
          canonical_url: article.canonicalUrl,
          title: article.title,
          summary: article.summary ?? null,
          content: article.content ?? null,
          author: article.author ?? null,
          language: article.language ?? null,
          keywords: Array.isArray(article.keywords)
            ? article.keywords.filter((k): k is string => typeof k === "string")
            : [],
          published_at: article.publishedAt?.toISOString() ?? null,
          fetched_at: article.fetchedAt.toISOString(),
          story_id: article.storyId ?? null,
          content_hash: article.contentHash ?? null,
          embedding
        };

        const storyId = await assignStoryId(client, config, articleDoc, embedding);
        articleDoc.story_id = storyId;

        if (storyId && article.storyId !== storyId) {
          await prisma.article.update({
            where: { id: article.id },
            data: { storyId }
          });
        }

        batch.push({ doc: articleDoc, articleId: article.id });
        processed++;
      } catch (error) {
        // Better error logging
        const errorDetails = error instanceof Error 
          ? { 
              message: error.message, 
              stack: error.stack, 
              name: error.name 
            }
          : error;
        logger.error({ 
          error: errorDetails, 
          articleId: article.id,
          articleTitle: article.title?.substring(0, 100) // First 100 chars for context
        }, "Failed to process article");
        errors++;
      }
    }

    if (batch.length > 0) {
      const operations: Array<
        | { index: { _index: string; _id: string } }
        | ArticleDocument
      > = [];

      for (const item of batch) {
        operations.push({
          index: {
            _index: indexName,
            _id: item.articleId
          }
        });
        operations.push(item.doc);
      }

      try {
        const response = await client.bulk({
          operations,
          timeout: "60s"
        });

        if (response.errors) {
          const failed = response.items.filter((item) => "index" in item && item.index?.error);
          logger.warn({ count: failed.length }, "Some documents failed to index");
          errors += failed.length;
        } else {
          indexed += batch.length;
        }
      } catch (error) {
        logger.error({ error }, "Bulk index failed");
        errors += batch.length;
      }
    }

    cursor = articles[articles.length - 1]?.id;
    logger.info(
      { processed, indexed, errors, cursor },
      "Progress update"
    );
  } while (cursor);

  logger.info(
    { processed, indexed, errors },
    "Backfill complete"
  );

  // Update stories index for all stories that were modified
  logger.info("Updating stories index...");
  const updatedStoryIds = new Set<string>();
  
  // Collect all unique story IDs from processed articles
  const allArticles = await prisma.article.findMany({
    where: {
      publishedAt: {
        gte: windowStart,
        lte: windowEnd
      },
      storyId: { not: null }
    },
    select: {
      storyId: true
    },
    distinct: ["storyId"]
  });

  for (const article of allArticles) {
    if (article.storyId) {
      updatedStoryIds.add(article.storyId);
    }
  }

  logger.info({ count: updatedStoryIds.size }, "Computing story metadata");

  const storyDocs: StoryDocument[] = [];
  for (const storyId of updatedStoryIds) {
    try {
      const storyDoc = await computeStoryMetadata(prisma, storyId, client, config);
      if (storyDoc) {
        storyDocs.push(storyDoc);
      }
    } catch (error) {
      logger.error({ error, storyId }, "Failed to compute story metadata");
    }
  }

  if (storyDocs.length > 0) {
    await batchUpdateStories(client, config, storyDocs, prisma);
    logger.info({ count: storyDocs.length }, "Updated stories in index");
  }

  await prisma.$disconnect();
  process.exit(0);
}

function parseArgs(): BackfillOptions {
  const args: BackfillOptions = {};

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === "--fromDays" && i + 1 < process.argv.length) {
      args.fromDays = Number.parseInt(process.argv[++i], 10);
    } else if (arg === "--from" && i + 1 < process.argv.length) {
      args.from = process.argv[++i];
    } else if (arg === "--to" && i + 1 < process.argv.length) {
      args.to = process.argv[++i];
    } else if (arg === "--batch" && i + 1 < process.argv.length) {
      args.batch = Number.parseInt(process.argv[++i], 10);
    } else if (arg === "--concurrency" && i + 1 < process.argv.length) {
      args.concurrency = Number.parseInt(process.argv[++i], 10);
    }
  }

  return args;
}

void main();

