import type { WorkerContext } from "../context.js";
import { createLogger } from "@news-api/logger";
import { getArticlesIndexName, getStoriesIndexName } from "@news-api/search";
import {
  computeStoryMetadata,
  batchUpdateStories
} from "../lib/search/story-maintenance.js";
import { workerMetrics } from "../metrics/registry.js";
import { cosineSimilarity } from "../lib/search/clustering.js";

const logger = createLogger({ name: "recluster" });

interface StoryCluster {
  storyId: string;
  articleIds: string[];
  embeddings: Map<string, number[]>;
  centroid: number[] | null;
}

/**
 * Main reclustering job - processes articles in sliding window
 */
export async function reclusterStories(context: WorkerContext): Promise<void> {
  if (!context.searchClient || !context.config.search.enabled) {
    logger.debug("Search disabled, skipping reclustering");
    return;
  }

  if (!context.config.clustering.enabled) {
    logger.debug("Clustering disabled, skipping reclustering");
    return;
  }

  const timer = workerMetrics.searchClusterDuration.startTimer();

  try {
    logger.info("Starting periodic reclustering job");

    const windowStart = new Date();
    windowStart.setHours(
      windowStart.getHours() - context.config.clustering.windowHours
    );

    // Step 1: Recompute centroids for all stories in window
    await recomputeCentroids(context, windowStart);

    // Step 2: Merge overlapping clusters
    await mergeOverlappingClusters(context, windowStart);

    // Step 3: Split low-cohesion clusters
    await splitLowCohesionClusters(context, windowStart);

    // Step 4: Re-evaluate story assignments for articles in window
    await reevaluateStoryAssignments(context, windowStart);

    // Step 5: Clean up orphaned stories (stories with 0 articles)
    await cleanupOrphanedStories(context);

    timer();
    logger.info("Periodic reclustering job completed");
  } catch (error) {
    timer();
    logger.error({ error }, "Reclustering job failed");
    throw error;
  }
}

/**
 * Recompute centroids for all stories with articles in the window
 */
async function recomputeCentroids(
  context: WorkerContext,
  windowStart: Date
): Promise<void> {
  logger.debug("Recomputing centroids for stories in window");

  const stories = await context.db.article.groupBy({
    by: ["storyId"],
    where: {
      storyId: { not: null },
      publishedAt: { gte: windowStart }
    },
    _count: { id: true }
  });

  const storyIds = stories.map((s) => s.storyId!);
  logger.debug({ count: storyIds.length }, "Found stories to recompute");

  const storyDocs = [];

  for (const storyId of storyIds) {
    try {
      const storyDoc = await computeStoryMetadata(
        context.db,
        storyId,
        context.searchClient!,
        context.config
      );

      if (storyDoc) {
        storyDocs.push(storyDoc);
      }
    } catch (error) {
      logger.error({ error, storyId }, "Failed to recompute story metadata");
    }
  }

  if (storyDocs.length > 0) {
    await batchUpdateStories(
      context.searchClient!,
      context.config,
      storyDocs,
      context.db
    );
    logger.info({ count: storyDocs.length }, "Recomputed centroids");
  }
}

/**
 * Merge overlapping clusters
 */
async function mergeOverlappingClusters(
  context: WorkerContext,
  windowStart: Date
): Promise<void> {
  logger.debug("Checking for overlapping clusters to merge");

  const stories = await fetchStoryClusters(context, windowStart);
  const merged = new Set<string>();
  const merges: Array<{ from: string; to: string }> = [];

  for (let i = 0; i < stories.length; i++) {
    const storyA = stories[i];
    if (!storyA || merged.has(storyA.storyId) || !storyA.centroid) continue;

    for (let j = i + 1; j < stories.length; j++) {
      const storyB = stories[j];
      if (!storyB || merged.has(storyB.storyId) || !storyB.centroid) continue;

      // Check centroid similarity
      const similarity = cosineSimilarity(storyA.centroid, storyB.centroid);

      if (similarity >= context.config.clustering.mergeSimilarityThreshold) {
        // Check time range overlap
        const timeOverlap = await checkTimeRangeOverlap(
          context,
          storyA.storyId,
          storyB.storyId
        );

        if (timeOverlap) {
          // Merge: use earlier storyId
          const keepStoryId =
            storyA.storyId < storyB.storyId
              ? storyA.storyId
              : storyB.storyId;
          const removeStoryId =
            keepStoryId === storyA.storyId ? storyB.storyId : storyA.storyId;

          merges.push({ from: removeStoryId, to: keepStoryId });
          merged.add(removeStoryId);
        }
      }
    }
  }

  if (merges.length > 0) {
    logger.info({ count: merges.length }, "Merging overlapping clusters");
    await executeMerges(context, merges);
    workerMetrics.searchClusters.inc({ action: "merge" });
  }
}

/**
 * Split low-cohesion clusters
 */
async function splitLowCohesionClusters(
  context: WorkerContext,
  windowStart: Date
): Promise<void> {
  logger.debug("Checking for low-cohesion clusters to split");

  const stories = await fetchStoryClusters(context, windowStart);
  const splits: Array<{ storyId: string; newStoryIds: string[] }> = [];

  for (const story of stories) {
    if (
      story.articleIds.length < context.config.clustering.minClusterSizeForSplit
    ) {
      continue;
    }

    if (!story.centroid) {
      continue;
    }

    // Compute cohesion (mean cosine similarity to centroid)
    const similarities: number[] = [];
    for (const articleId of story.articleIds) {
      const embedding = story.embeddings.get(articleId);
      if (embedding) {
        similarities.push(cosineSimilarity(story.centroid, embedding));
      }
    }

    const cohesion =
      similarities.length > 0
        ? similarities.reduce((a, b) => a + b, 0) / similarities.length
        : 1.0;

    if (cohesion < context.config.clustering.splitCohesionThreshold) {
      // Split cluster using k-means (k=2)
      const splitResult = await splitCluster(context, story);
      if (splitResult) {
        splits.push(splitResult);
      }
    }
  }

  if (splits.length > 0) {
    logger.info({ count: splits.length }, "Splitting low-cohesion clusters");
    await executeSplits(context, splits);
    workerMetrics.searchClusters.inc({ action: "split" });
  }
}

/**
 * Re-evaluate story assignments for articles in window
 */
async function reevaluateStoryAssignments(
  context: WorkerContext,
  windowStart: Date
): Promise<void> {
  logger.debug("Re-evaluating story assignments");

  const indexName = getArticlesIndexName(context.config);
  const { ArticleStatus } = await import("@news-api/db");
  const articles = await context.db.article.findMany({
    where: {
      publishedAt: { gte: windowStart },
      status: ArticleStatus.enriched
    },
    select: {
      id: true,
      storyId: true
    },
    take: 1000 // Process in batches
  });

  logger.debug({ count: articles.length }, "Articles to re-evaluate");

  let reassigned = 0;

  for (const article of articles) {
    try {
      // Fetch full article document from ES for clustering
      let fullDoc: { found: boolean; _source?: any };
      try {
        const result = await context.searchClient!.get({
          index: indexName,
          id: article.id
        });
        fullDoc = result;
      } catch (error: any) {
        // If article not found in ES, skip it (it may not have been indexed yet)
        if (error.meta?.statusCode === 404) {
          // Article not in Elasticsearch - skip re-evaluation
          // It will be indexed and assigned a storyId when it's enriched/indexed
          continue;
        }
        // Re-throw other errors
        throw error;
      }

      if (!fullDoc.found || !fullDoc._source) {
        // Article not in Elasticsearch - skip re-evaluation
        continue;
      }

      const source = fullDoc._source as any;
      const embedding = source.embedding;

      if (!embedding || !Array.isArray(embedding)) {
        // Article in ES but no embedding - skip (can't cluster without embedding)
        continue;
      }

      // Re-run clustering to find best story
      const { assignStoryId } = await import("../lib/search/clustering.js");
      
      const articleDoc = {
        id: article.id,
        feed_id: source.feed_id || "",
        source_url: source.source_url || "",
        canonical_url: source.canonical_url || null,
        title: source.title || "",
        summary: source.summary || null,
        content: source.content || null,
        author: source.author || null,
        language: source.language || null,
        keywords: Array.isArray(source.keywords) ? source.keywords : [],
        published_at: source.published_at || null,
        fetched_at: source.fetched_at || new Date().toISOString(),
        story_id: source.story_id || null,
        content_hash: source.content_hash || null,
        embedding: embedding
      };

      const newStoryId = await assignStoryId(
        context.searchClient,
        context.config,
        articleDoc,
        embedding
      );

      // Update if story changed
      if (newStoryId && newStoryId !== article.storyId) {
        await context.db.article.update({
          where: { id: article.id },
          data: { storyId: newStoryId }
        });

        // Update ES document
        await context.searchClient!.update({
          index: indexName,
          id: article.id,
          doc: { story_id: newStoryId }
        });

        // Queue story updates
        if (article.storyId) {
          context.storyQueue.enqueue(article.storyId);
        }
        if (newStoryId) {
          context.storyQueue.enqueue(newStoryId);
        }

        reassigned++;
      }
    } catch (error: any) {
      // Only log non-404 errors (404 means article not in ES, which is expected for some articles)
      if (error.meta?.statusCode !== 404) {
        logger.error({ error, articleId: article.id }, "Failed to re-evaluate article");
      }
      // Silently skip articles not in Elasticsearch
      continue;
    }
  }

  if (reassigned > 0) {
    logger.info({ count: reassigned }, "Reassigned articles to stories");
  }
}

/**
 * Fetch story clusters with embeddings
 */
async function fetchStoryClusters(
  context: WorkerContext,
  windowStart: Date
): Promise<StoryCluster[]> {
  const stories = await context.db.article.groupBy({
    by: ["storyId"],
    where: {
      storyId: { not: null },
      publishedAt: { gte: windowStart }
    },
    _count: { id: true }
  });

  const clusters: StoryCluster[] = [];
  const indexName = getArticlesIndexName(context.config);

  for (const story of stories) {
    if (!story.storyId) continue;

    const articles = await context.db.article.findMany({
      where: { storyId: story.storyId },
      select: { id: true }
    });

    const articleIds = articles.map((a) => a.id);
    const embeddings = new Map<string, number[]>();

    // Fetch embeddings from ES
    if (articleIds.length > 0) {
      const mgetResponse = await context.searchClient!.mget({
        index: indexName,
        ids: articleIds.slice(0, 100), // Limit to 100 for performance
        _source: ["embedding"]
      });

      for (const doc of mgetResponse.docs) {
        if ("found" in doc && doc.found && "_source" in doc && doc._source && "_id" in doc) {
          const source = doc._source as { embedding?: number[] };
          if (source.embedding && Array.isArray(source.embedding)) {
            embeddings.set(doc._id, source.embedding);
          }
        }
      }
    }

    // Compute centroid
    const embeddingArray = Array.from(embeddings.values());
    const centroid =
      embeddingArray.length > 0 ? computeCentroid(embeddingArray) : null;

    clusters.push({
      storyId: story.storyId,
      articleIds,
      embeddings,
      centroid
    });
  }

  return clusters;
}

/**
 * Check if two stories have overlapping time ranges
 */
async function checkTimeRangeOverlap(
  context: WorkerContext,
  storyIdA: string,
  storyIdB: string
): Promise<boolean> {
  const [articlesA, articlesB] = await Promise.all([
    context.db.article.findMany({
      where: { storyId: storyIdA },
      select: { publishedAt: true },
      take: 1,
      orderBy: { publishedAt: "asc" }
    }),
    context.db.article.findMany({
      where: { storyId: storyIdB },
      select: { publishedAt: true },
      take: 1,
      orderBy: { publishedAt: "asc" }
    })
  ]);

  if (articlesA.length === 0 || articlesB.length === 0) {
    return false;
  }

  // Simple overlap check: if stories have articles within 24h of each other
  const dateA = articlesA[0]?.publishedAt;
  const dateB = articlesB[0]?.publishedAt;

  if (!dateA || !dateB) {
    return false;
  }

  const diffHours = Math.abs(dateA.getTime() - dateB.getTime()) / (1000 * 60 * 60);
  return diffHours < 24;
}

/**
 * Execute cluster merges
 */
async function executeMerges(
  context: WorkerContext,
  merges: Array<{ from: string; to: string }>
): Promise<void> {
  for (const merge of merges) {
    try {
      // Update all articles
      await context.db.article.updateMany({
        where: { storyId: merge.from },
        data: { storyId: merge.to }
      });

      // Update ES documents
      const indexName = getArticlesIndexName(context.config);
      const articles = await context.db.article.findMany({
        where: { storyId: merge.from },
        select: { id: true }
      });

      for (const article of articles) {
        await context.searchClient!.update({
          index: indexName,
          id: article.id,
          doc: { story_id: merge.to }
        });
      }

      // Delete old story from Elasticsearch
      const storiesIndex = getStoriesIndexName(context.config);
      try {
        await context.searchClient!.delete({
          index: storiesIndex,
          id: merge.from
        });
      } catch (error: any) {
        // Ignore 404 errors (story may not exist in ES)
        if (error.meta?.statusCode !== 404) {
          throw error;
        }
      }

      // Delete old story from PostgreSQL (only if it exists)
      const storyExists = await context.db.story.findUnique({
        where: { id: merge.from },
        select: { id: true }
      });

      if (storyExists) {
        await context.db.story.delete({
          where: { id: merge.from }
        });
      }

      // Queue update for merged story
      context.storyQueue.enqueue(merge.to);

      logger.debug({ from: merge.from, to: merge.to }, "Merged clusters");
    } catch (error) {
      logger.error({ error, merge }, "Failed to merge clusters");
    }
  }
}

/**
 * Split a cluster using k-means (k=2)
 */
async function splitCluster(
  context: WorkerContext,
  cluster: StoryCluster
): Promise<{ storyId: string; newStoryIds: string[] } | null> {
  if (cluster.articleIds.length < 2 || !cluster.centroid) {
    return null;
  }

  const embeddings = Array.from(cluster.embeddings.entries());
  if (embeddings.length < 2) {
    return null;
  }

  // Simple k-means with k=2
  const [centroid1, centroid2] = initializeCentroids(embeddings.map((e) => e[1]));

  // Iterate a few times
  for (let iter = 0; iter < 10; iter++) {
    const group1: string[] = [];
    const group2: string[] = [];

    for (const [articleId, embedding] of embeddings) {
      const dist1 = euclideanDistance(embedding, centroid1);
      const dist2 = euclideanDistance(embedding, centroid2);
      if (dist1 < dist2) {
        group1.push(articleId);
      } else {
        group2.push(articleId);
      }
    }

    if (group1.length === 0 || group2.length === 0) {
      break; // Can't split further
    }

    // Update centroids
    const emb1 = group1
      .map((id) => embeddings.find((e) => e[0] === id)?.[1])
      .filter((e): e is number[] => e !== undefined);
    const emb2 = group2
      .map((id) => embeddings.find((e) => e[0] === id)?.[1])
      .filter((e): e is number[] => e !== undefined);

    if (emb1.length > 0 && centroid1.length > 0) {
      const newCentroid1 = computeCentroid(emb1);
      for (let i = 0; i < Math.min(centroid1.length, newCentroid1.length); i++) {
        centroid1[i] = newCentroid1[i] ?? 0;
      }
    }
    if (emb2.length > 0 && centroid2.length > 0) {
      const newCentroid2 = computeCentroid(emb2);
      for (let i = 0; i < Math.min(centroid2.length, newCentroid2.length); i++) {
        centroid2[i] = newCentroid2[i] ?? 0;
      }
    }
  }

  // Assign articles to groups
  const group1: string[] = [];
  const group2: string[] = [];

  for (const [articleId, embedding] of embeddings) {
    const dist1 = euclideanDistance(embedding, centroid1);
    const dist2 = euclideanDistance(embedding, centroid2);
    if (dist1 < dist2) {
      group1.push(articleId);
    } else {
      group2.push(articleId);
    }
  }

  if (group1.length === 0 || group2.length === 0) {
    return null; // Can't split
  }

  // Create new story for group2, keep original for group1
  const { v5: uuidv5 } = await import("uuid");
  const STORY_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
  const newStoryId = uuidv5(group2[0] ?? cluster.storyId, STORY_NAMESPACE);

  // Update articles in group2
  await context.db.article.updateMany({
    where: { id: { in: group2 } },
    data: { storyId: newStoryId }
  });

  // Update ES
  const indexName = getArticlesIndexName(context.config);
  for (const articleId of group2) {
    await context.searchClient!.update({
      index: indexName,
      id: articleId,
      doc: { story_id: newStoryId }
    });
  }

  // Queue story updates
  context.storyQueue.enqueue(cluster.storyId);
  context.storyQueue.enqueue(newStoryId);

  return { storyId: cluster.storyId, newStoryIds: [newStoryId] };
}

/**
 * Execute cluster splits
 */
async function executeSplits(
  context: WorkerContext,
  splits: Array<{ storyId: string; newStoryIds: string[] }>
): Promise<void> {
  // Splits are already executed in splitCluster
  // This is just for logging/metrics
  logger.info({ count: splits.length }, "Executed cluster splits");
}

/**
 * Initialize centroids for k-means (farthest point sampling)
 */
function initializeCentroids(embeddings: number[][]): [number[], number[]] {
  if (embeddings.length < 2) {
    return [embeddings[0] || [], embeddings[0] || []];
  }

  // Use first and farthest point
  const centroid1 = embeddings[0] ?? [];
  let maxDist = 0;
  let farthestIdx = 0;

  for (let i = 1; i < embeddings.length; i++) {
    const embedding = embeddings[i];
    if (embedding) {
      const dist = euclideanDistance(centroid1, embedding);
      if (dist > maxDist) {
        maxDist = dist;
        farthestIdx = i;
      }
    }
  }

  return [centroid1, embeddings[farthestIdx] ?? centroid1];
}

/**
 * Compute centroid from embeddings
 */
function computeCentroid(embeddings: number[][]): number[] {
  if (embeddings.length === 0) {
    return [];
  }

  const firstEmbedding = embeddings[0];
  if (!firstEmbedding || firstEmbedding.length === 0) {
    return [];
  }

  const dims = firstEmbedding.length;
  const centroid = new Array(dims).fill(0);

  for (const embedding of embeddings) {
    if (embedding && embedding.length === dims) {
      for (let i = 0; i < dims; i++) {
        centroid[i] += embedding[i] ?? 0;
      }
    }
  }

  for (let i = 0; i < dims; i++) {
    centroid[i] /= embeddings.length;
  }

  return centroid;
}

/**
 * Euclidean distance
 */
function euclideanDistance(a: number[] | undefined, b: number[] | undefined): number {
  if (!a || !b || a.length !== b.length) {
    return Infinity;
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

/**
 * Clean up orphaned stories (stories with 0 articles)
 */
async function cleanupOrphanedStories(context: WorkerContext): Promise<void> {
  logger.debug("Cleaning up orphaned stories");

  // Get all stories from PostgreSQL
  const allStories = await context.db.story.findMany({
    select: { id: true }
  });

  if (allStories.length === 0) {
    logger.debug("No stories found");
    return;
  }

  // Get all story IDs that have articles (more efficient than checking each individually)
  const storiesWithArticles = await context.db.article.groupBy({
    by: ["storyId"],
    where: {
      storyId: { not: null }
    },
    _count: { id: true }
  });

  const storyIdsWithArticles = new Set(
    storiesWithArticles.map((s) => s.storyId!).filter((id): id is string => id !== null)
  );

  // Find orphaned stories (stories without any articles)
  const orphanedStoryIds = allStories
    .map((s) => s.id)
    .filter((id) => !storyIdsWithArticles.has(id));

  if (orphanedStoryIds.length === 0) {
    logger.debug("No orphaned stories found");
    return;
  }

  logger.info({ count: orphanedStoryIds.length }, "Found orphaned stories, cleaning up");

  // First, clear storyId from articles that reference these orphaned stories
  // This ensures articles will be re-clustered with the correct storyId
  const articlesWithOrphanedStories = await context.db.article.findMany({
    where: {
      storyId: { in: orphanedStoryIds }
    },
    select: { id: true, storyId: true }
  });

  if (articlesWithOrphanedStories.length > 0) {
    logger.debug(
      { count: articlesWithOrphanedStories.length },
      "Clearing storyId from articles with orphaned stories"
    );

    // Clear storyId in PostgreSQL
    await context.db.article.updateMany({
      where: {
        storyId: { in: orphanedStoryIds }
      },
      data: {
        storyId: null
      }
    });

    // Clear story_id in Elasticsearch articles index
    if (context.searchClient) {
      const articlesIndex = getArticlesIndexName(context.config);
      const updateOperations: Array<
        | { update: { _index: string; _id: string } }
        | { doc: { story_id: null } }
      > = [];

      for (const article of articlesWithOrphanedStories) {
        updateOperations.push({
          update: {
            _index: articlesIndex,
            _id: article.id
          }
        });
        updateOperations.push({
          doc: { story_id: null }
        });
      }

      try {
        await context.searchClient.bulk({
          operations: updateOperations,
          refresh: false
        });
        logger.debug(
          { count: articlesWithOrphanedStories.length },
          "Cleared story_id from articles in Elasticsearch"
        );
      } catch (error) {
        logger.error(
          { error, count: articlesWithOrphanedStories.length },
          "Failed to clear story_id from articles in Elasticsearch"
        );
      }
    }
  }

  // Delete from PostgreSQL
  await context.db.story.deleteMany({
    where: { id: { in: orphanedStoryIds } }
  });

  // Delete from Elasticsearch in batch
  if (context.searchClient && orphanedStoryIds.length > 0) {
    const storiesIndex = getStoriesIndexName(context.config);
    const deleteOperations = orphanedStoryIds.map((storyId) => ({
      delete: {
        _index: storiesIndex,
        _id: storyId
      }
    }));

    try {
      await context.searchClient.bulk({
        operations: deleteOperations,
        refresh: false
      });
    } catch (error) {
      logger.error({ error, count: orphanedStoryIds.length }, "Failed to delete orphaned stories from Elasticsearch");
    }
  }

  logger.info(
    {
      orphanedStories: orphanedStoryIds.length,
      articlesCleared: articlesWithOrphanedStories.length
    },
    "Cleaned up orphaned stories and cleared article references"
  );
}

/**
 * Start reclustering scheduler
 */
export function startReclusteringScheduler(
  context: WorkerContext
): { stop: () => void } {
  if (!context.config.clustering.enabled) {
    context.logger.info("Clustering disabled, not starting reclustering scheduler");
    return { stop: () => {} };
  }

  let isRunning = false;
  const intervalMs = context.config.clustering.reclusterIntervalMs;

  const execute = async () => {
    if (isRunning) {
      context.logger.debug("Reclustering already running, skipping tick");
      return;
    }

    isRunning = true;
    try {
      await reclusterStories(context);
    } catch (error) {
      context.logger.error({ error }, "Reclustering tick failed");
    } finally {
      isRunning = false;
    }
  };

  // Start after initial delay
  const initialDelay = Math.min(intervalMs, 60_000); // Max 1 minute initial delay
  setTimeout(() => {
    void execute();
  }, initialDelay);

  const timer = setInterval(() => {
    void execute();
  }, intervalMs);

  context.logger.info(
    { intervalMs, windowHours: context.config.clustering.windowHours },
    "Reclustering scheduler started"
  );

  return {
    stop: () => {
      clearInterval(timer);
    }
  };
}

