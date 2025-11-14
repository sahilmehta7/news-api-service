import type { Client } from "@elastic/elasticsearch";
import type { AppConfig } from "@news-api/config";
import type { PrismaClientType } from "@news-api/db";
import { Prisma } from "@news-api/db";
import {
  getStoriesIndexName,
  getArticlesIndexName,
  type StoryDocument
} from "@news-api/search";
import { createLogger } from "@news-api/logger";
import { workerMetrics } from "../../metrics/registry.js";

const logger = createLogger({ name: "story-maintenance" });

interface StoryMember {
  id: string;
  title: string;
  summary: string | null;
  keywords: string[];
  sourceUrl: string;
  publishedAt: Date | null;
  embedding: number[] | null;
}

/**
 * Compute story metadata from member articles
 */
export async function computeStoryMetadata(
  db: PrismaClientType,
  storyId: string,
  searchClient: Client | null,
  config: AppConfig
): Promise<StoryDocument | null> {
  if (!searchClient) {
    return null;
  }

  // Fetch all articles for this story from Postgres
  const articles = await db.article.findMany({
    where: {
      storyId
    },
    select: {
      id: true,
      title: true,
      summary: true,
      keywords: true,
      sourceUrl: true,
      publishedAt: true
    },
    orderBy: {
      publishedAt: "asc"
    }
  });

  if (articles.length === 0) {
    logger.warn({ storyId }, "No articles found for story");
    return null;
  }

  // Fetch embeddings from Elasticsearch
  const articleIds = articles.map((a) => a.id);
  const embeddings = await fetchEmbeddings(searchClient, config, articleIds);

  const members: StoryMember[] = articles.map((article, index) => ({
    id: article.id,
    title: article.title,
    summary: article.summary,
    keywords: Array.isArray(article.keywords)
      ? article.keywords.filter((k): k is string => typeof k === "string")
      : [],
    sourceUrl: article.sourceUrl,
    publishedAt: article.publishedAt,
    embedding: embeddings.get(article.id) ?? null
  }));

  // Compute metadata
  const titleRep = computeTitleRep(members);
  const summary = computeSummary(members);
  const keywords = computeKeywords(members);
  const sources = computeSources(members);
  const { timeRangeStart, timeRangeEnd } = computeTimeRange(members);
  const centroidEmbedding = computeCentroid(members);

  return {
    story_id: storyId,
    title_rep: titleRep,
    summary,
    keywords,
    sources,
    time_range_start: timeRangeStart?.toISOString() ?? null,
    time_range_end: timeRangeEnd?.toISOString() ?? null,
    centroid_embedding: centroidEmbedding
  };
}

/**
 * Fetch embeddings for articles from Elasticsearch
 */
async function fetchEmbeddings(
  client: Client,
  config: AppConfig,
  articleIds: string[]
): Promise<Map<string, number[]>> {
  const indexName = getArticlesIndexName(config);
  const embeddings = new Map<string, number[]>();

  // Fetch in batches of 100
  for (let i = 0; i < articleIds.length; i += 100) {
    const batch = articleIds.slice(i, i + 100);
    try {
      const response = await client.mget({
        index: indexName,
        ids: batch,
        _source: ["embedding"]
      });

      for (const doc of response.docs) {
        if ("found" in doc && doc.found && "_source" in doc && doc._source && "_id" in doc) {
          const source = doc._source as { embedding?: number[] };
          if (source.embedding && Array.isArray(source.embedding)) {
            embeddings.set(doc._id, source.embedding);
          }
        }
      }
    } catch (error) {
      logger.error({ error, batchSize: batch.length }, "Failed to fetch embeddings batch");
    }
  }

  return embeddings;
}

/**
 * Compute representative title (medoid - article with embedding closest to centroid)
 */
function computeTitleRep(members: StoryMember[]): string | null {
  if (members.length === 0) {
    return null;
  }

  // If no embeddings, use most recent article title
  const membersWithEmbeddings = members.filter((m) => m.embedding !== null);
  if (membersWithEmbeddings.length === 0) {
    return members[members.length - 1]?.title ?? null;
  }

  // Compute centroid
  const centroid = computeCentroid(membersWithEmbeddings);
  if (!centroid) {
    return members[members.length - 1]?.title ?? null;
  }

  // Find medoid (article with embedding closest to centroid)
  let minDistance = Infinity;
  let medoidIndex = 0;

  for (let i = 0; i < membersWithEmbeddings.length; i++) {
    const member = membersWithEmbeddings[i];
    if (member && member.embedding) {
      const distance = euclideanDistance(centroid, member.embedding);
      if (distance < minDistance) {
        minDistance = distance;
        medoidIndex = i;
      }
    }
  }

  const medoid = membersWithEmbeddings[medoidIndex];
  return medoid?.title ?? null;
}

/**
 * Compute summary (lead-3 sentences from top article)
 */
function computeSummary(members: StoryMember[]): string | null {
  if (members.length === 0) {
    return null;
  }

  // Use summary from most recent article if available
  const sortedByDate = [...members].sort((a, b) => {
    const dateA = a.publishedAt?.getTime() ?? 0;
    const dateB = b.publishedAt?.getTime() ?? 0;
    return dateB - dateA;
  });

  for (const member of sortedByDate) {
    if (member.summary) {
      // Take first 3 sentences
      const sentences = member.summary.split(/[.!?]+/).filter((s) => s.trim().length > 0);
      if (sentences.length > 0) {
        return sentences.slice(0, 3).join(". ").trim() + ".";
      }
    }
  }

  // Fallback to title of most recent article
  return sortedByDate[0]?.title ?? null;
}

/**
 * Compute keywords (union of all member keywords, top 10 by frequency)
 */
function computeKeywords(members: StoryMember[]): string[] {
  const keywordCounts = new Map<string, number>();

  for (const member of members) {
    for (const keyword of member.keywords) {
      const normalized = keyword.toLowerCase().trim();
      if (normalized.length > 0) {
        keywordCounts.set(normalized, (keywordCounts.get(normalized) ?? 0) + 1);
      }
    }
  }

  // Sort by frequency and take top 10
  return Array.from(keywordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([keyword]) => keyword);
}

/**
 * Compute unique source URLs
 */
function computeSources(members: StoryMember[]): string[] {
  const sources = new Set<string>();
  for (const member of members) {
    try {
      const url = new URL(member.sourceUrl);
      sources.add(url.origin);
    } catch {
      // Invalid URL, skip
    }
  }
  return Array.from(sources);
}

/**
 * Compute time range from member published dates
 */
function computeTimeRange(members: StoryMember[]): {
  timeRangeStart: Date | null;
  timeRangeEnd: Date | null;
} {
  const dates = members
    .map((m) => m.publishedAt)
    .filter((d): d is Date => d !== null);

  if (dates.length === 0) {
    return { timeRangeStart: null, timeRangeEnd: null };
  }

  return {
    timeRangeStart: new Date(Math.min(...dates.map((d) => d.getTime()))),
    timeRangeEnd: new Date(Math.max(...dates.map((d) => d.getTime())))
  };
}

/**
 * Compute centroid embedding (mean of all member embeddings)
 */
function computeCentroid(members: StoryMember[]): number[] | undefined {
  const membersWithEmbeddings = members.filter(
    (m): m is StoryMember & { embedding: number[] } => m.embedding !== null
  );

  if (membersWithEmbeddings.length === 0) {
    return undefined;
  }

  const firstMember = membersWithEmbeddings[0];
  if (!firstMember || !firstMember.embedding || firstMember.embedding.length === 0) {
    return undefined;
  }

  const dims = firstMember.embedding.length;
  const centroid = new Array(dims).fill(0);

  for (const member of membersWithEmbeddings) {
    if (member && member.embedding && member.embedding.length === dims) {
      for (let i = 0; i < dims; i++) {
        centroid[i] += member.embedding[i] ?? 0;
      }
    }
  }

  // Normalize by count
  for (let i = 0; i < dims; i++) {
    centroid[i] /= membersWithEmbeddings.length;
  }

  return centroid;
}

/**
 * Euclidean distance between two vectors
 */
function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
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
 * Update story document in Elasticsearch and PostgreSQL
 */
export async function updateStoryIndex(
  client: Client | null,
  config: AppConfig,
  storyDoc: StoryDocument,
  db?: PrismaClientType
): Promise<void> {
  const timer = workerMetrics.searchClusterDuration.startTimer();

  try {
    // Update Elasticsearch
    if (client) {
      const indexName = getStoriesIndexName(config);
      await client.index({
        index: indexName,
        id: storyDoc.story_id,
        document: storyDoc,
        refresh: false // Don't wait for refresh for better performance
      });
      logger.debug({ storyId: storyDoc.story_id }, "Updated story in Elasticsearch");
    }

    // Update PostgreSQL
    if (db) {
      await upsertStoryInPostgres(db, storyDoc);
      logger.debug({ storyId: storyDoc.story_id }, "Updated story in PostgreSQL");
    }

    timer();
  } catch (error) {
    timer();
    logger.error({ error, storyId: storyDoc.story_id }, "Failed to update story");
    throw error;
  }
}

/**
 * Upsert story record in PostgreSQL
 */
async function upsertStoryInPostgres(
  db: PrismaClientType,
  storyDoc: StoryDocument
): Promise<void> {
  try {
    await db.story.upsert({
      where: { id: storyDoc.story_id },
      create: {
        id: storyDoc.story_id,
        titleRep: storyDoc.title_rep ?? null,
        summary: storyDoc.summary ?? null,
        keywords: storyDoc.keywords.length > 0 ? storyDoc.keywords : Prisma.JsonNull,
        timeRangeStart: storyDoc.time_range_start
          ? new Date(storyDoc.time_range_start)
          : null,
        timeRangeEnd: storyDoc.time_range_end
          ? new Date(storyDoc.time_range_end)
          : null
      },
      update: {
        titleRep: storyDoc.title_rep ?? null,
        summary: storyDoc.summary ?? null,
        keywords: storyDoc.keywords.length > 0 ? storyDoc.keywords : Prisma.JsonNull,
        timeRangeStart: storyDoc.time_range_start
          ? new Date(storyDoc.time_range_start)
          : null,
        timeRangeEnd: storyDoc.time_range_end
          ? new Date(storyDoc.time_range_end)
          : null
      }
    });
  } catch (error) {
    logger.error({ error, storyId: storyDoc.story_id }, "Failed to upsert story in PostgreSQL");
    throw error;
  }
}

/**
 * Batch update multiple stories in Elasticsearch and PostgreSQL
 */
export async function batchUpdateStories(
  client: Client | null,
  config: AppConfig,
  storyDocs: StoryDocument[],
  db?: PrismaClientType
): Promise<void> {
  if (storyDocs.length === 0) {
    return;
  }

  const timer = workerMetrics.searchClusterDuration.startTimer();

  try {
    // Update Elasticsearch
    if (client) {
      const indexName = getStoriesIndexName(config);
      const operations: Array<
        { index: { _index: string; _id: string } } | StoryDocument
      > = [];

      for (const storyDoc of storyDocs) {
        operations.push({
          index: {
            _index: indexName,
            _id: storyDoc.story_id
          }
        });
        operations.push(storyDoc);
      }

      await client.bulk({
        operations,
        refresh: false
      });
      logger.debug({ count: storyDocs.length }, "Batch updated stories in Elasticsearch");
    }

    // Update PostgreSQL
    if (db) {
      await batchUpsertStoriesInPostgres(db, storyDocs);
      logger.debug({ count: storyDocs.length }, "Batch updated stories in PostgreSQL");
    }

    timer();
  } catch (error) {
    timer();
    logger.error({ error, count: storyDocs.length }, "Failed to batch update stories");
    throw error;
  }
}

/**
 * Batch upsert story records in PostgreSQL
 */
async function batchUpsertStoriesInPostgres(
  db: PrismaClientType,
  storyDocs: StoryDocument[]
): Promise<void> {
  try {
    // Use transaction for atomicity
    await db.$transaction(
      storyDocs.map((storyDoc) =>
        db.story.upsert({
          where: { id: storyDoc.story_id },
          create: {
            id: storyDoc.story_id,
            titleRep: storyDoc.title_rep ?? null,
            summary: storyDoc.summary ?? null,
            keywords: storyDoc.keywords.length > 0 ? storyDoc.keywords : Prisma.JsonNull,
            timeRangeStart: storyDoc.time_range_start
              ? new Date(storyDoc.time_range_start)
              : null,
            timeRangeEnd: storyDoc.time_range_end
              ? new Date(storyDoc.time_range_end)
              : null
          },
          update: {
            titleRep: storyDoc.title_rep ?? null,
            summary: storyDoc.summary ?? null,
            keywords: storyDoc.keywords.length > 0 ? storyDoc.keywords : Prisma.JsonNull,
            timeRangeStart: storyDoc.time_range_start
              ? new Date(storyDoc.time_range_start)
              : null,
            timeRangeEnd: storyDoc.time_range_end
              ? new Date(storyDoc.time_range_end)
              : null
          }
        })
      )
    );
  } catch (error) {
    logger.error({ error, count: storyDocs.length }, "Failed to batch upsert stories in PostgreSQL");
    throw error;
  }
}

