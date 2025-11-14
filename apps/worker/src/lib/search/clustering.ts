import type { Client } from "@elastic/elasticsearch";
import type { AppConfig } from "@news-api/config";
import type { ArticleDocument } from "@news-api/search";
import { getArticlesIndexName, getStoriesIndexName } from "@news-api/search";
import { createLogger } from "@news-api/logger";
import { v5 as uuidv5 } from "uuid";
import { workerMetrics } from "../../metrics/registry.js";
import {
  titleJaccardSimilarity,
  entityOverlap,
  combinedSimilarity
} from "./similarity.js";

const logger = createLogger({ name: "clustering" });

const STORY_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

// Base similarity threshold for cosine similarity
// Combined similarity uses weighted average, so threshold is adjusted accordingly
const SIMILARITY_THRESHOLD = 0.82;
const CANDIDATE_WINDOW_HOURS = 72;
const MAX_CANDIDATES = 200;

// Similarity weights for combined score
// Loaded from config in assignStoryId function

interface Candidate {
  id: string;
  storyId: string | null;
  embedding: number[];
  publishedAt: string | null;
  title: string;
  content: string | null;
}

export async function assignStoryId(
  client: Client | null,
  config: AppConfig,
  article: ArticleDocument,
  embedding: number[]
): Promise<string | null> {
  if (!client || !embedding) {
    return null;
  }

  // Load similarity weights from config
  const similarityWeights = {
    cosine: config.clustering.cosineWeight,
    jaccard: config.clustering.jaccardWeight,
    entity: config.clustering.entityWeight
  };

  const indexName = getArticlesIndexName(config);
  const windowStart = new Date();
  windowStart.setHours(windowStart.getHours() - CANDIDATE_WINDOW_HOURS);

  const timer = workerMetrics.searchKnnQueryDuration.startTimer();

  try {
    workerMetrics.searchKnnQueries.inc();
    const searchResponse = await client.search<{ embedding?: number[] }>({
      index: indexName,
      size: MAX_CANDIDATES,
      query: {
        bool: {
          must: [
            {
              range: {
                published_at: {
                  gte: windowStart.toISOString()
                }
              }
            }
          ],
          must_not: [
            {
              term: {
                id: article.id
              }
            }
          ]
        }
      },
      knn: {
        field: "embedding",
        query_vector: embedding,
        k: MAX_CANDIDATES,
        num_candidates: 1000
      },
      _source: ["id", "story_id", "published_at", "embedding", "title", "content"]
    });

    const candidates: Candidate[] = [];
    const articleTitle = article.title || "";
    const articleContent = article.content || article.summary || "";

    for (const hit of searchResponse.hits.hits) {
      if (!hit._id) {
        continue;
      }

      if (hit._source?.embedding && Array.isArray(hit._source.embedding)) {
        const source = hit._source as {
          story_id?: string;
          published_at?: string;
          title?: string;
          content?: string;
        };

        // Compute cosine similarity
        const cosineSim = cosineSimilarity(embedding, hit._source.embedding);

        // Only proceed if cosine similarity meets threshold
        // This filters candidates before computing more expensive Jaccard/entity similarity
        if (cosineSim >= SIMILARITY_THRESHOLD * 0.9) {
          // Compute Jaccard similarity for title shingles
          const candidateTitle = source.title || "";
          const jaccardSim = titleJaccardSimilarity(articleTitle, candidateTitle);

          // Compute entity overlap
          const candidateContent = source.content || "";
          const entitySim = entityOverlap(
            articleTitle + " " + articleContent,
            candidateTitle + " " + candidateContent
          );

          // Compute combined similarity
          const combinedSim = combinedSimilarity(
            cosineSim,
            jaccardSim,
            entitySim,
            similarityWeights
          );

          // Use combined similarity threshold (slightly lower than cosine-only threshold
          // since we're adding more signals)
          const effectiveThreshold = SIMILARITY_THRESHOLD * 0.95;
          if (combinedSim >= effectiveThreshold) {
            candidates.push({
              id: hit._id,
              storyId: source.story_id ?? null,
              embedding: hit._source.embedding,
              publishedAt: source.published_at ?? null,
              title: candidateTitle || "",
              content: candidateContent || null
            });
          }
        }
      }
    }

    // If no similar articles found, article gets its own story (returns null, which means no storyId)
    // This allows articles to exist without a story until they find similar articles later
    if (candidates.length === 0) {
      return null;
    }

    const storyId = findOrCreateStoryId(candidates, article.id, article.published_at);
    
    if (storyId) {
      workerMetrics.searchClusters.inc({ action: storyId === uuidv5(article.id, STORY_NAMESPACE) ? "create" : "merge" });
    }
    
    timer();
    return storyId;
  } catch (error) {
    timer();
    logger.error({ error, articleId: article.id }, "Failed to assign story ID");
    return null;
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const aVal = a[i] ?? 0;
    const bVal = b[i] ?? 0;
    dotProduct += aVal * bVal;
    normA += aVal * aVal;
    normB += bVal * bVal;
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0;
  }
  return dotProduct / denominator;
}

function findOrCreateStoryId(
  candidates: Candidate[],
  articleId: string,
  articlePublishedAt: string | null
): string {
  // If no candidates, create a new story for this article
  if (candidates.length === 0) {
    return uuidv5(articleId, STORY_NAMESPACE);
  }

  // Group candidates by existing storyId
  // If multiple candidates share a storyId, that's the story we should join
  const storyIdGroups = new Map<string, Candidate[]>();
  const candidatesWithoutStory: Candidate[] = [];

  for (const candidate of candidates) {
    if (candidate.storyId) {
      if (!storyIdGroups.has(candidate.storyId)) {
        storyIdGroups.set(candidate.storyId, []);
      }
      storyIdGroups.get(candidate.storyId)!.push(candidate);
    } else {
      candidatesWithoutStory.push(candidate);
    }
  }

  // If there are candidates with existing storyIds, use the most common one
  // (or the one with the earliest article if tied)
  if (storyIdGroups.size > 0) {
    // Find the storyId with the most candidates
    let bestStoryId: string | null = null;
    let maxCount = 0;
    const earliestByStory = new Map<string, string>();

    for (const [storyId, groupCandidates] of storyIdGroups.entries()) {
      if (groupCandidates.length > maxCount) {
        maxCount = groupCandidates.length;
        bestStoryId = storyId;
      }

      // Track earliest article ID per story for tie-breaking
      const earliest = groupCandidates
        .sort((a, b) => {
          const dateA = a.publishedAt || "";
          const dateB = b.publishedAt || "";
          return dateA.localeCompare(dateB);
        })[0];
      if (earliest) {
        earliestByStory.set(storyId, earliest.id);
      }
    }

    // If there's a clear winner, use it
    if (bestStoryId && maxCount > 0) {
      return bestStoryId;
    }

    // If tied, use the story with the earliest article
    if (bestStoryId) {
      return bestStoryId;
    }
  }

  // If no candidates have storyIds, or all are tied, create a new story
  // Use the earliest article ID (from candidates or current article) as the seed
  const allCandidates = [...candidates, {
    id: articleId,
    storyId: null,
    embedding: [],
    publishedAt: articlePublishedAt,
    title: "",
    content: null
  }];

  const sorted = allCandidates.sort((a, b) => {
    const dateA = a.publishedAt || "";
    const dateB = b.publishedAt || "";
    return dateA.localeCompare(dateB);
  });

  const earliest = sorted[0];
  if (!earliest) {
    // Fallback to articleId if no candidates
    return uuidv5(articleId, STORY_NAMESPACE);
  }

  return uuidv5(earliest.id, STORY_NAMESPACE);
}

