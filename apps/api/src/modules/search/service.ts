import type { FastifyInstance } from "fastify";
import type { Client } from "@elastic/elasticsearch";
import type { AppConfig } from "@news-api/config";
import {
  getArticlesIndexName,
  getStoriesIndexName,
  type ArticleDocument,
  type StoryDocument
} from "@news-api/search";
import type { SearchQuery, StoryListQuery, StoryDetailQuery } from "./schemas.js";
import { listArticles } from "../articles/service.js";
import type { ArticleListQuery } from "../articles/schemas.js";
import { serializeRawArticle, ensureStringArray, ensureNullableRecord } from "../articles/service.js";

export async function searchArticles(
  app: FastifyInstance,
  query: SearchQuery,
  searchClient: Client | null,
  config: AppConfig
) {
  if (!searchClient || !config.search.enabled) {
    const articleQuery: ArticleListQuery = {
      page: Math.floor(query.offset / query.size) + 1,
      pageSize: query.size,
      q: query.q,
      feedId: query.feedId,
      feedCategory: query.feedCategory,
      language: query.language,
      fromDate: query.from,
      toDate: query.to,
      sort: "relevance", // Search results are always sorted by relevance
      order: "desc",
      keywords: []
    };
    return listArticles(app, articleQuery);
  }

  const indexName = getArticlesIndexName(config);
  
  // Build filters for Elasticsearch (date, language, feedId only)
  // Note: Category filtering is done at database level for reliability
  const filters: any[] = [];
  if (query.from) {
    filters.push({
      range: {
        published_at: {
          gte: query.from.toISOString()
        }
      }
    });
  }
  if (query.to) {
    filters.push({
      range: {
        published_at: {
          lte: query.to.toISOString()
        }
      }
    });
  }
  if (query.language) {
    filters.push({
      term: {
        language: query.language
      }
    });
  }
  if (query.feedId) {
    filters.push({
      term: {
        feed_id: query.feedId
      }
    });
  }

  // Get query embedding for k-NN search
  const embedding = query.q
    ? await getQueryEmbedding(app, query.q)
    : undefined;

  // Execute BM25 and k-NN queries separately
  const [bm25Results, knnResults] = await Promise.all([
    executeBM25Query(searchClient, indexName, query, filters),
    embedding
      ? executeKNNQuery(searchClient, indexName, embedding, filters)
      : Promise.resolve({ hits: [], total: 0 })
  ]);

  // Union and merge results
  const mergedResults = mergeSearchResults(
    bm25Results.hits,
    knnResults.hits,
    query.q ? query.from : undefined
  );

  // Apply recency boost
  const scoredResults = applyRecencyBoost(mergedResults);

  // Sort by combined score
  scoredResults.sort((a, b) => b.combinedScore - a.combinedScore);

  // Apply story diversification if requested
  let candidateArticleIds: string[];
  let moreCountMap: Map<string, number> = new Map();
  
  // Calculate how many candidates we need to fetch
  // If category filtering, fetch more to account for potential filtering out
  const categoryFilterBuffer = query.feedCategory ? 3 : 1; // Fetch 3x more if filtering by category
  const candidateSize = (query.offset + query.size) * categoryFilterBuffer;
  
  if (query.groupByStory) {
    // For story grouping, we need to diversify first
    // Get enough diversified results to cover filtering and pagination
    const diversified = diversifyByStory(scoredResults, candidateSize);
    candidateArticleIds = diversified.map((item) => item.id);
    // Preserve moreCount metadata for all diversified results
    for (const item of diversified) {
      if (item.moreCount !== undefined && item.moreCount > 0) {
        moreCountMap.set(item.id, item.moreCount);
      }
    }
  } else {
    // Get candidate article IDs (more than needed to account for filtering)
    candidateArticleIds = scoredResults.slice(0, candidateSize).map((r) => r.id);
  }

  // Fetch full article data from database with category filtering
  // Filter by category at database level for reliability (categories may not match exactly)
  const whereClause: any = {
    id: { in: candidateArticleIds }
  };
  
  // Apply category filter at database level
  if (query.feedCategory && query.feedCategory.trim()) {
    const categoryFilter = query.feedCategory.trim();
    whereClause.feed = {
      category: {
        equals: categoryFilter,
        mode: "insensitive"
      }
    };
  }

  const articles = await app.db.article.findMany({
    where: whereClause,
    select: {
      id: true,
      feedId: true,
      title: true,
      summary: true,
      content: true,
      sourceUrl: true,
      canonicalUrl: true,
      author: true,
      language: true,
      keywords: true,
      publishedAt: true,
      fetchedAt: true,
      createdAt: true,
      updatedAt: true,
      storyId: true,
      feed: {
        select: {
          name: true,
          category: true
        }
      },
      articleMetadata: true
    }
  });

  // Create a map for quick lookup
  const articlesById = new Map(articles.map((a) => [a.id, a]));

  // Preserve order from search results (using candidate IDs order)
  // Filter out articles that don't match category (if filtering)
  const filteredOrderedIds = candidateArticleIds.filter((id) => articlesById.has(id));
  
  // Apply pagination to filtered results
  const paginatedIds = filteredOrderedIds.slice(query.offset, query.offset + query.size);
  
  // Serialize articles in the correct order
  const data = paginatedIds
    .map((id) => {
      const article = articlesById.get(id);
      if (!article) return null;
      const serialized = serializeArticleFromEntity(article);
      // Add moreCount if available (for story grouping)
      const moreCount = moreCountMap.get(id);
      return {
        ...serialized,
        moreCount
      };
    })
    .filter((article): article is NonNullable<typeof article> => article !== null);

  // Calculate total count
  // If category filtering is active, we need a more accurate count from the database
  let total: number;
  if (query.feedCategory && query.feedCategory.trim()) {
    // Get accurate count from database for category-filtered articles
    // We need to count articles that match the category and are in our search results
    // Since we can't easily count all matching articles in Elasticsearch with category filter,
    // we estimate based on the ratio of filtered results to candidates
    const categoryFilter = query.feedCategory.trim();
    
    // Count how many articles in our candidate set match the category
    const categoryMatchCount = await app.db.article.count({
      where: {
        id: { in: candidateArticleIds },
        feed: {
          category: {
            equals: categoryFilter,
            mode: "insensitive"
          }
        }
      }
    });
    
    // Estimate total: if we got all candidates and they all matched, use Elasticsearch total
    // Otherwise, estimate based on the ratio
    const elasticsearchTotal = Math.max(bm25Results.total, knnResults.total);
    if (candidateArticleIds.length <= elasticsearchTotal && categoryMatchCount === candidateArticleIds.length) {
      // All candidates matched, so total is likely close to Elasticsearch total
      total = elasticsearchTotal;
    } else {
      // Estimate based on match ratio
      const matchRatio = candidateArticleIds.length > 0 
        ? categoryMatchCount / candidateArticleIds.length 
        : 0;
      total = Math.floor(elasticsearchTotal * matchRatio);
    }
  } else {
    // No category filter - use Elasticsearch total directly
    total = Math.max(bm25Results.total, knnResults.total);
  }

  // Transform pagination to match frontend expectations
  const page = Math.floor(query.offset / query.size) + 1;
  const pageSize = query.size;

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      hasNextPage: query.offset + query.size < total
    }
  };
}

export async function searchStories(
  app: FastifyInstance,
  query: StoryListQuery,
  searchClient: Client | null,
  config: AppConfig
) {
  if (!searchClient || !config.search.enabled) {
    return {
      data: [],
      pagination: {
        limit: query.limit ?? 25,
        nextCursor: null,
        hasNextPage: false,
        total: 0
      }
    };
  }

  function decodeCursor(cursor?: string): number {
    if (!cursor) return 0;
    try {
      const json = Buffer.from(cursor, "base64").toString("utf8");
      const payload = JSON.parse(json) as { o: number };
      return typeof payload.o === "number" && payload.o >= 0 ? payload.o : 0;
    } catch {
      return 0;
    }
  }

  function encodeCursor(offset: number): string {
    const json = JSON.stringify({ o: offset });
    return Buffer.from(json, "utf8").toString("base64");
  }

  const limit = query.limit ?? query.size ?? 25;
  const offset = query.cursor ? decodeCursor(query.cursor) : (query.offset ?? 0);

  const indexName = getStoriesIndexName(config);
  const embedding = query.q ? await getQueryEmbedding(app, query.q) : undefined;

  const boolQuery: any = {
    must: []
  };

  if (query.q && !embedding) {
    boolQuery.must.push({
      multi_match: {
        query: query.q,
        fields: ["title_rep^3", "summary", "keywords^2"]
      }
    });
  }

  const filters: any[] = [];

  if (query.from) {
    filters.push({
      range: {
        time_range_start: {
          gte: query.from.toISOString()
        }
      }
    });
  }

  if (query.to) {
    filters.push({
      range: {
        time_range_end: {
          lte: query.to.toISOString()
        }
      }
    });
  }

  if (filters.length > 0) {
    boolQuery.filter = filters;
  }

  const searchParams: any = {
    index: indexName,
    size: limit,
    from: offset
  };

  if (embedding) {
    searchParams.knn = {
      field: "centroid_embedding",
      query_vector: embedding,
      k: 100,
      num_candidates: 500
    };
  } else if (boolQuery.must.length > 0) {
    searchParams.query = { bool: boolQuery };
  } else {
    searchParams.query = { match_all: {} };
  }

  const response = await searchClient.search<StoryDocument>(searchParams);

  const hits = response.hits.hits;
  const total = response.hits.total
    ? typeof response.hits.total === "number"
      ? response.hits.total
      : response.hits.total.value
    : 0;

  const storyIds = hits.map((hit) => hit._source.story_id);

  const articles = await app.db.article.findMany({
    where: {
      storyId: { in: storyIds }
    },
    include: {
      feed: {
        select: {
          name: true,
          category: true,
          tags: true
        }
      },
      articleMetadata: true
    },
    orderBy: {
      publishedAt: "desc"
    },
    take: limit * 5
  });

  const articlesByStory = new Map<string, typeof articles>();
  for (const article of articles) {
    if (article.storyId) {
      if (!articlesByStory.has(article.storyId)) {
        articlesByStory.set(article.storyId, []);
      }
      articlesByStory.get(article.storyId)!.push(article);
    }
  }

  const requestedCategories = query.categories;
  const requestedTags = query.tags;
  const requestedLanguage = query.language;

  const data = hits
    .map((hit) => {
      const storyArticlesAll = articlesByStory.get(hit._source.story_id) || [];

      // Apply language/category/tag filters at article level and keep stories with at least one match
      const storyArticles = storyArticlesAll.filter((a) => {
        const matchesLanguage =
          !requestedLanguage || (a.language ?? undefined) === requestedLanguage;
        const matchesCategory =
          !requestedCategories || requestedCategories.length === 0
            ? true
            : requestedCategories.includes((a.feed.category ?? "").trim());
        const feedTags = ensureStringArray((a.feed as any).tags);
        const matchesTags =
          !requestedTags || requestedTags.length === 0
            ? true
            : feedTags.some((t) => requestedTags.includes(t));
        return matchesLanguage && matchesCategory && matchesTags;
      });

      return {
        story_id: hit._source.story_id,
        title_rep: hit._source.title_rep,
        summary: hit._source.summary,
        keywords: hit._source.keywords || [],
        sources: hit._source.sources || [],
        time_range_start: hit._source.time_range_start,
        time_range_end: hit._source.time_range_end,
        article_count: storyArticles.length,
        top_articles: storyArticles.slice(0, 3).map((a) => ({
          id: a.id,
          title: a.title,
          sourceUrl: a.sourceUrl,
          publishedAt: a.publishedAt?.toISOString() ?? null
        }))
      };
    })
    .filter((story) => story.article_count > 0); // Filter out stories with 0 articles

  // Adjust total count to exclude orphaned stories
  const filteredTotal = data.length + offset;
  const hasNextPage = data.length === limit && (offset + limit) < (typeof total === "number" ? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER);
  const nextCursor = hasNextPage ? encodeCursor(offset + limit) : null;

  return {
    data,
    pagination: {
      limit,
      nextCursor,
      hasNextPage,
      total: filteredTotal
    }
  };
}

export async function getStoryDetail(
  app: FastifyInstance,
  storyId: string,
  query: StoryDetailQuery,
  searchClient: Client | null,
  config: AppConfig
) {
  const offset = (query.page - 1) * query.pageSize;

  const articles = await app.db.article.findMany({
    where: {
      storyId
    },
    include: {
      feed: {
        select: {
          name: true,
          category: true
        }
      },
      articleMetadata: true
    },
    orderBy: {
      publishedAt: "desc"
    },
    skip: offset,
    take: query.pageSize
  });

  const total = await app.db.article.count({
    where: { storyId }
  });

  let storyMetadata: StoryDocument | null = null;

  if (searchClient && config.search.enabled) {
    const indexName = getStoriesIndexName(config);
    try {
      const response = await searchClient.get<StoryDocument>({
        index: indexName,
        id: storyId
      });
      storyMetadata = response._source;
    } catch (error) {
      app.log.warn({ error, storyId }, "Failed to fetch story metadata from ES");
    }
  }

  return {
    story_id: storyId,
    title_rep: storyMetadata?.title_rep ?? null,
    summary: storyMetadata?.summary ?? null,
    keywords: storyMetadata?.keywords || [],
    time_range_start: storyMetadata?.time_range_start ?? null,
    time_range_end: storyMetadata?.time_range_end ?? null,
    articles: articles.map((article) => ({
      id: article.id,
      feedId: article.feedId,
      feedName: article.feed.name,
      feedCategory: article.feed.category,
      title: article.title,
      summary: article.summary,
      sourceUrl: article.sourceUrl,
      publishedAt: article.publishedAt?.toISOString() ?? null
    })),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      hasNextPage: offset + articles.length < total
    }
  };
}

/**
 * Execute BM25 query
 */
async function executeBM25Query(
  searchClient: Client,
  indexName: string,
  query: SearchQuery,
  filters: any[]
): Promise<{
  hits: Array<{ _id: string; _source: ArticleDocument; _score?: number }>;
  total: number;
}> {
  const boolQuery: any = {
    must: []
  };

  if (query.q) {
    boolQuery.must.push({
      multi_match: {
        query: query.q,
        fields: ["title^3", "content", "keywords^2"]
      }
    });
  }

  if (filters.length > 0) {
    boolQuery.filter = filters;
  }

  const searchParams: any = {
    index: indexName,
    size: 200, // Get top 200 for union
    query: boolQuery.must.length > 0 ? { bool: boolQuery } : { match_all: {} }
  };

  const response = await searchClient.search<ArticleDocument>(searchParams);
  const hits = response.hits.hits;
  const total = response.hits.total
    ? typeof response.hits.total === "number"
      ? response.hits.total
      : response.hits.total.value
    : 0;

  return { hits, total };
}

/**
 * Execute k-NN query
 */
async function executeKNNQuery(
  searchClient: Client,
  indexName: string,
  embedding: number[],
  filters: any[]
): Promise<{
  hits: Array<{ _id: string; _source: ArticleDocument; _score?: number }>;
  total: number;
}> {
  const searchParams: any = {
    index: indexName,
    size: 200, // Get top 200 for union
    knn: {
      field: "embedding",
      query_vector: embedding,
      k: 200,
      num_candidates: 1000
    }
  };

  if (filters.length > 0) {
    searchParams.knn.filter = {
      bool: {
        filter: filters
      }
    };
  }

  const response = await searchClient.search<ArticleDocument>(searchParams);
  const hits = response.hits.hits;
  const total = response.hits.total
    ? typeof response.hits.total === "number"
      ? response.hits.total
      : response.hits.total.value
    : 0;

  return { hits, total };
}

/**
 * Merge BM25 and k-NN results, deduplicate and normalize scores
 */
function mergeSearchResults(
  bm25Hits: Array<{ _id: string; _source: ArticleDocument; _score?: number }>,
  knnHits: Array<{ _id: string; _source: ArticleDocument; _score?: number }>,
  fromDate?: Date
): Array<{
  id: string;
  article: ArticleDocument;
  bm25Score: number;
  knnScore: number;
  publishedAt: Date | null;
}> {
  const resultMap = new Map<
    string,
    {
      id: string;
      article: ArticleDocument;
      bm25Score: number;
      knnScore: number;
      publishedAt: Date | null;
    }
  >();

  // Normalize BM25 scores (0-1 range)
  const bm25Scores = bm25Hits.map((h) => h._score ?? 0);
  const maxBm25 = Math.max(...bm25Scores, 1);
  const minBm25 = Math.min(...bm25Scores, 0);

  // Normalize k-NN scores (cosine similarity, already 0-1 range)
  const knnScores = knnHits.map((h) => h._score ?? 0);
  const maxKnn = Math.max(...knnScores, 1);
  const minKnn = Math.min(...knnScores, 0);

  // Process BM25 results
  for (let i = 0; i < bm25Hits.length; i++) {
    const hit = bm25Hits[i];
    const normalizedBm25 =
      maxBm25 > minBm25
        ? (bm25Scores[i] - minBm25) / (maxBm25 - minBm25)
        : 0.5;

    const publishedAt = hit._source.published_at
      ? new Date(hit._source.published_at)
      : null;

    resultMap.set(hit._id, {
      id: hit._id,
      article: hit._source,
      bm25Score: normalizedBm25,
      knnScore: 0,
      publishedAt
    });
  }

  // Process k-NN results (merge with existing or create new)
  for (let i = 0; i < knnHits.length; i++) {
    const hit = knnHits[i];
    const normalizedKnn =
      maxKnn > minKnn ? (knnScores[i] - minKnn) / (maxKnn - minKnn) : 0.5;

    const publishedAt = hit._source.published_at
      ? new Date(hit._source.published_at)
      : null;

    const existing = resultMap.get(hit._id);
    if (existing) {
      existing.knnScore = normalizedKnn;
    } else {
      resultMap.set(hit._id, {
        id: hit._id,
        article: hit._source,
        bm25Score: 0,
        knnScore: normalizedKnn,
        publishedAt
      });
    }
  }

  return Array.from(resultMap.values());
}

/**
 * Apply recency boost and compute combined score
 * Formula: score = 0.6 * bm25_norm + 0.3 * (1 + cosine_sim) + 0.1 * recency_decay
 */
function applyRecencyBoost(
  results: Array<{
    id: string;
    article: ArticleDocument;
    bm25Score: number;
    knnScore: number;
    publishedAt: Date | null;
  }>
): Array<{
  id: string;
  article: ArticleDocument;
  bm25Score: number;
  knnScore: number;
  combinedScore: number;
  publishedAt: Date | null;
}> {
  const now = Date.now();
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

  return results.map((r) => {
    // Recency decay: exponential decay over 3 days
    let recencyDecay = 0.5; // Default for articles without date
    if (r.publishedAt) {
      const ageMs = now - r.publishedAt.getTime();
      if (ageMs >= 0 && ageMs <= threeDaysMs) {
        recencyDecay = Math.exp(-ageMs / threeDaysMs) * 0.5 + 0.5;
      } else if (ageMs < 0) {
        recencyDecay = 1.0; // Future dates get full boost
      } else {
        recencyDecay = 0.5 * Math.exp(-(ageMs - threeDaysMs) / threeDaysMs);
      }
    }

    // Combined score: 0.6 * bm25 + 0.3 * (1 + knn) + 0.1 * recency
    const combinedScore =
      0.6 * r.bm25Score + 0.3 * (1 + r.knnScore) + 0.1 * recencyDecay;

    return {
      ...r,
      combinedScore
    };
  });
}

/**
 * Diversify results by story, selecting top article per story
 * Returns articles with moreCount indicating additional articles in story
 */
export function diversifyByStory(
  results: Array<{
    id: string;
    article: ArticleDocument;
    combinedScore: number;
  }>,
  pageSize: number
): Array<ArticleDocument & { id: string; moreCount?: number }> {
  // Group by story_id
  const byStory = new Map<
    string,
    Array<{
      id: string;
      article: ArticleDocument;
      combinedScore: number;
    }>
  >();

  for (const result of results) {
    const storyId = result.article.story_id || "none";
    if (!byStory.has(storyId)) {
      byStory.set(storyId, []);
    }
    byStory.get(storyId)!.push(result);
  }

  // Sort groups by max score within group
  const sortedGroups = Array.from(byStory.entries())
    .map(([storyId, articles]) => {
      // Sort articles within group by score
      articles.sort((a, b) => b.combinedScore - a.combinedScore);
      return {
        storyId,
        articles,
        maxScore: articles[0]?.combinedScore ?? 0
      };
    })
    .sort((a, b) => b.maxScore - a.maxScore);

  // Take top article from each group until page size reached
  const diversified: Array<ArticleDocument & { id: string; moreCount?: number }> =
    [];

  for (const group of sortedGroups) {
    if (diversified.length >= pageSize) {
      break;
    }

    const topArticle = group.articles[0];
    if (topArticle) {
      diversified.push({
        id: topArticle.id,
        ...topArticle.article,
        moreCount: group.articles.length > 1 ? group.articles.length - 1 : undefined
      });
    }
  }

  return diversified;
}

/**
 * Get query embedding using embedding provider
 */
async function getQueryEmbedding(
  app: FastifyInstance,
  query: string
): Promise<number[] | undefined> {
  try {
    const embedding = await app.embeddingProvider.embed(query);
    return embedding;
  } catch (error) {
    app.log.warn({ error }, "Failed to compute query embedding");
    return undefined;
  }
}

/**
 * Serialize article from Prisma entity to API response format
 */
function serializeArticleFromEntity(article: {
  id: string;
  feedId: string;
  title: string;
  summary: string | null;
  content: string | null;
  sourceUrl: string;
  canonicalUrl: string | null;
  author: string | null;
  language: string | null;
  keywords: unknown;
  publishedAt: Date | null;
  fetchedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  storyId: string | null;
  feed: {
    name: string;
    category: string | null;
  };
  articleMetadata: {
    enrichmentStatus: string | null;
    enrichedAt: Date | null;
    retries: number;
    openGraph: unknown;
    twitterCard: unknown;
    metadata: unknown;
    faviconUrl: string | null;
    heroImageUrl: string | null;
    contentType: string | null;
    languageConfidence: unknown;
    readingTimeSeconds: number | null;
    wordCount: number | null;
    errorMessage: string | null;
    contentPlain: string | null;
    rawContentHtml: string | null;
  } | null;
}) {
  const meta = article.articleMetadata;

  return {
    id: article.id,
    feedId: article.feedId,
    feedName: article.feed.name,
    feedCategory: article.feed.category,
    title: article.title,
    summary: article.summary,
    content: article.content,
    contentPlain: meta?.contentPlain ?? article.content ?? null,
    hasFullContent: Boolean(meta?.contentPlain) || Boolean(meta?.rawContentHtml),
    sourceUrl: article.sourceUrl,
    canonicalUrl: article.canonicalUrl,
    author: article.author,
    language: article.language,
    keywords: ensureStringArray(article.keywords),
    publishedAt: article.publishedAt ? article.publishedAt.toISOString() : null,
    fetchedAt: article.fetchedAt.toISOString(),
    enrichmentStatus: meta?.enrichmentStatus ?? null,
    readingTimeSeconds: meta?.readingTimeSeconds ?? null,
    wordCount: meta?.wordCount ?? null,
    heroImageUrl: meta?.heroImageUrl ?? null,
    faviconUrl: meta?.faviconUrl ?? null,
    contentType: meta?.contentType ?? null,
    openGraph: ensureNullableRecord(meta?.openGraph),
    twitterCard: ensureNullableRecord(meta?.twitterCard),
    metadata: ensureNullableRecord(meta?.metadata),
    errorMessage: meta?.errorMessage ?? null,
    relevance: undefined,
    storyId: article.storyId ?? null,
    createdAt: article.createdAt.toISOString(),
    updatedAt: article.updatedAt.toISOString()
  };
}

