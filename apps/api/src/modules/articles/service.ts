import type { FastifyInstance } from "fastify";
import { Prisma } from "@news-api/db";

import {
  articleListResponseSchema,
  type ArticleListQuery
} from "./schemas.js";
import { expandQueryWithSynonyms, rerankCandidates } from "@news-api/search";
import { metrics } from "../../metrics/registry.js";

type RawArticleRow = {
  id: string;
  feed_id: string;
  feed_name: string;
  feed_category: string | null;
  title: string;
  summary: string | null;
  content: string | null;
  source_url: string;
  canonical_url: string | null;
  author: string | null;
  language: string | null;
  keywords: unknown;
  published_at: Date | null;
  fetched_at: Date;
  created_at: Date;
  updated_at: Date;
  enrichment_status: string | null;
  reading_time_seconds: number | null;
  word_count: number | null;
  hero_image_url: string | null;
  favicon_url: string | null;
  content_type: string | null;
  open_graph: unknown;
  twitter_card: unknown;
  metadata: unknown;
  error_message: string | null;
  relevance: number | null;
  total: bigint | number | null;
  content_plain_available: boolean;
  raw_content_available: boolean;
};

export async function listArticles(
  app: FastifyInstance,
  query: ArticleListQuery
) {
  const stopTimer = metrics.searchQueryDuration.startTimer({ route: "/articles" });
  const { page, pageSize, ...filters } = query;
  const offset = (page - 1) * pageSize;

  const conditions: Prisma.Sql[] = [];

  // Prepare query text with synonyms (capped expansion)
  const rawQ = filters.q?.trim();
  const qWithSynonyms = rawQ
    ? expandQueryWithSynonyms(rawQ, {
        locale: "en",
        maxTotalTerms: 12,
        maxSynonymsPerToken: 2
      })
    : undefined;

  if (filters.feedId) {
    conditions.push(Prisma.sql`a.feed_id = ${filters.feedId}::uuid`);
  }

  if (filters.feedCategory) {
    conditions.push(Prisma.sql`f.category = ${filters.feedCategory}`);
  }

  if (filters.language) {
    conditions.push(Prisma.sql`a.language ILIKE ${filters.language as string}`);
  }

  if (
    filters.fromDate instanceof Date &&
    !Number.isNaN(filters.fromDate.getTime())
  ) {
    conditions.push(Prisma.sql`a.published_at >= ${filters.fromDate}`);
  }

  if (
    filters.toDate instanceof Date &&
    !Number.isNaN(filters.toDate.getTime())
  ) {
    conditions.push(Prisma.sql`a.published_at <= ${filters.toDate}`);
  }

  if (filters.enrichmentStatus) {
    conditions.push(
      Prisma.sql`am.enrichment_status = ${filters.enrichmentStatus}`
    );
  }

  if (filters.hasMedia === true) {
    conditions.push(Prisma.sql`am.hero_image_url IS NOT NULL`);
  } else if (filters.hasMedia === false) {
    conditions.push(Prisma.sql`am.hero_image_url IS NULL`);
  }

  if (filters.keywords && filters.keywords.length > 0) {
    for (const keyword of filters.keywords) {
      const pattern = `%${keyword}%`;
      conditions.push(
        Prisma.sql`(a.title ILIKE ${pattern} OR a.summary ILIKE ${pattern})`
      );
    }
  }

  // Weighted text search vector: title (A), summary (B), content (C)
  // Prefer plain content from metadata; fall back to article.content
  const weightedSearchVector = Prisma.sql`
        setweight(to_tsvector('english', coalesce(a.title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(a.summary, '')), 'B') ||
        setweight(
          to_tsvector('english', coalesce(am.content_plain, a.content, '')),
          'C'
        )
      `;

  // Use web-style query parsing to support phrases, AND/OR/-, and parentheses
  const tsQuery = qWithSynonyms
    ? Prisma.sql`websearch_to_tsquery('english', ${qWithSynonyms})`
    : Prisma.sql`NULL`;

  // Recency decay: exponential decay by age in days (half-life ~7 days)
  const ageSeconds = Prisma.sql`EXTRACT(EPOCH FROM (now() - coalesce(a.published_at, a.fetched_at)))`;
  const ageDays = Prisma.sql`${ageSeconds} / 86400.0`;
  const recencyDecay = Prisma.sql`exp(-(${ageDays}) / 7.0)`;

  // Base relevance from weighted vector and recency
  // Using pure lexical search only - vector search is handled by Elasticsearch via /search endpoint
  const baseRank = Prisma.sql`ts_rank_cd((${weightedSearchVector}), ${tsQuery})`;
  const relevanceExpr = qWithSynonyms
    ? Prisma.sql`(${baseRank} * ${recencyDecay})`
    : Prisma.sql`0`;

  if (qWithSynonyms) {
    conditions.push(
      Prisma.sql`(${weightedSearchVector}) @@ ${tsQuery}`
    );
  }

  // Optional fuzzy fallback: for short queries, include ILIKE match on title/summary
  if (filters.fuzzy && rawQ && rawQ.length <= 20) {
    const fuzzyPattern = `%${rawQ}%`;
    conditions.push(
      Prisma.sql`(a.title ILIKE ${fuzzyPattern} OR a.summary ILIKE ${fuzzyPattern})`
    );
  }

  const whereClause =
    conditions.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
      : Prisma.sql``;

  const orderDirection = filters.order ?? "desc";
  const orderExpressions: string[] = [];

  if (filters.sort === "fetchedAt") {
    orderExpressions.push(
      orderDirection === "desc" ? "a.fetched_at DESC" : "a.fetched_at ASC"
    );
  } else if (filters.sort === "relevance" && filters.q) {
    // Order primarily by computed relevance (which includes recency decay), then by recency
    orderExpressions.push("relevance DESC", "coalesce(a.published_at, a.fetched_at) DESC");
  } else {
    orderExpressions.push(
      orderDirection === "desc" ? "a.published_at DESC" : "a.published_at ASC"
    );
  }

  orderExpressions.push("a.id DESC");

  const orderClause =
    orderExpressions.length > 0
      ? Prisma.sql`ORDER BY ${Prisma.raw(orderExpressions.join(", "))}`
      : Prisma.sql``;

  // Optional entity filters require joining article_entities
  const entityFilterJoin =
    (filters.entities && filters.entities.length > 0) ||
    (filters.entityTypes && filters.entityTypes.length > 0)
      ? Prisma.sql`LEFT JOIN article_entities ae ON ae.article_id = a.id`
      : Prisma.sql``;

  // Optional entity conditions
  const entityConditions: Prisma.Sql[] = [];
  if (filters.entities && filters.entities.length > 0) {
    entityConditions.push(
      Prisma.sql`(ae.text ILIKE ANY (${Prisma.join(
        filters.entities.map((e) => `%${e}%`),
        ", "
      )}) OR ae.canonical ILIKE ANY (${Prisma.join(
        filters.entities.map((e) => `%${e.toLowerCase()}%`),
        ", "
      )}))`
    );
  }
  if (filters.entityTypes && filters.entityTypes.length > 0) {
    entityConditions.push(
      Prisma.sql`(ae.type IN (${Prisma.join(filters.entityTypes, ", ")}))`
    );
  }
  const entityWhere =
    entityConditions.length > 0
      ? Prisma.sql` AND ${Prisma.join(entityConditions, " AND ")}`
      : Prisma.sql``;

  const querySql = Prisma.sql`
        SELECT
          a.id,
          a.feed_id,
          f.name AS feed_name,
          f.category AS feed_category,
          a.title,
          a.summary,
          a.content,
          a.source_url,
          a.canonical_url,
          a.author,
          a.language,
          a.keywords,
          a.published_at,
          a.fetched_at,
          a.created_at,
          a.updated_at,
          am.enrichment_status,
          am.reading_time_seconds,
          am.word_count,
          am.hero_image_url,
          am.favicon_url,
          am.content_type,
          am.open_graph,
          am.twitter_card,
          am.metadata,
          am.error_message,
          CASE WHEN am.content_plain IS NOT NULL THEN TRUE ELSE FALSE END AS content_plain_available,
          CASE WHEN am.raw_content_html IS NOT NULL THEN TRUE ELSE FALSE END AS raw_content_available,
          ${filters.includeHighlights && qWithSynonyms ? Prisma.sql`ts_headline('english', coalesce(am.content_plain, a.content, ''), ${tsQuery}, 'MaxFragments=1, FragmentDelimiter=E'' … ''')` : Prisma.sql`NULL`} AS highlight,
          ${relevanceExpr} AS relevance,
          COUNT(*) OVER() AS total
        FROM articles a
        INNER JOIN feeds f ON f.id = a.feed_id
        LEFT JOIN article_metadata am ON am.article_id = a.id
        ${entityFilterJoin}
        ${whereClause}
        ${entityWhere}
        ${orderClause}
        LIMIT ${pageSize} OFFSET ${offset}
      `;

  const rows = await app.db.$queryRaw<RawArticleRow[]>(querySql);
  const firstRow = rows[0];
  const total = rows.length > 0 ? Number(firstRow?.total ?? rows.length) : 0;

  const data = rows.map((r) => {
    const base = serializeRawArticle(r);
    if (filters.includeHighlights && qWithSynonyms && typeof (r as any).highlight === "string") {
      return { ...base, highlight: (r as any).highlight as string };
    }
    return base;
  });

  // Duplicate collapsing (simple heuristic): collapse by canonicalUrl, else by normalised title
  const seen = new Set<string>();
  const collapsed: typeof data = [];
  let collapsedCount = 0;
  for (const item of data) {
    const key =
      (item.canonicalUrl ?? "").toLowerCase() ||
      item.sourceUrl.toLowerCase() ||
      item.title.trim().toLowerCase();
    if (seen.has(key)) {
      collapsedCount++;
      continue;
    }
    seen.add(key);
    collapsed.push(item);
  }
  if (collapsedCount > 0) {
    metrics.searchDuplicatesCollapsed.inc(collapsedCount);
  }

  // Optional reranker (feature flag)
  let finalData = collapsed;
  if (qWithSynonyms && process.env.RERANKER_ENABLED === "true") {
    const stopRerank = metrics.searchRerankerDuration.startTimer();
    try {
      const candidates = collapsed.slice(0, 100).map((d) => ({
        id: d.id,
        title: d.title,
        summary: d.summary,
        content: d.content,
        score: typeof d.relevance === "number" ? d.relevance : 0
      }));
      const reranked = await rerankCandidates(qWithSynonyms, candidates, {
        topK: collapsed.length
      });
      const order = new Map(reranked.map((c, i) => [c.id, i]));
      finalData = [...collapsed].sort(
        (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
      );
      metrics.searchRerankerApplied.inc();
    } catch {
      // ignore reranker failures
    } finally {
      stopRerank();
    }
  }

  // Facets: feeds, categories, languages (computed in side queries with same filters)
  const facetWhere = whereClause;
  const facets: {
    feeds?: { id: string; name: string; count: number }[];
    categories?: { category: string | null; count: number }[];
    languages?: { language: string | null; count: number }[];
  } = {};

  const [feedFacetRows, categoryFacetRows, languageFacetRows] = await Promise.all([
    app.db.$queryRaw<{ id: string; name: string; count: bigint | number }[]>(Prisma.sql`
      SELECT a.feed_id AS id, f.name AS name, COUNT(*)::bigint AS count
      FROM articles a
      INNER JOIN feeds f ON f.id = a.feed_id
      LEFT JOIN article_metadata am ON am.article_id = a.id
      ${facetWhere}
      GROUP BY a.feed_id, f.name
      ORDER BY count DESC
      LIMIT 20
    `),
    app.db.$queryRaw<{ category: string | null; count: bigint | number }[]>(Prisma.sql`
      SELECT f.category AS category, COUNT(*)::bigint AS count
      FROM articles a
      INNER JOIN feeds f ON f.id = a.feed_id
      LEFT JOIN article_metadata am ON am.article_id = a.id
      ${facetWhere}
      GROUP BY f.category
      ORDER BY count DESC
      LIMIT 20
    `),
    app.db.$queryRaw<{ language: string | null; count: bigint | number }[]>(Prisma.sql`
      SELECT a.language AS language, COUNT(*)::bigint AS count
      FROM articles a
      LEFT JOIN article_metadata am ON am.article_id = a.id
      ${facetWhere}
      GROUP BY a.language
      ORDER BY count DESC
      LIMIT 20
    `)
  ]);

  facets.feeds = feedFacetRows.map((r) => ({ id: r.id, name: r.name, count: Number(r.count) }));
  facets.categories = categoryFacetRows.map((r) => ({ category: r.category, count: Number(r.count) }));
  facets.languages = languageFacetRows.map((r) => ({ language: r.language, count: Number(r.count) }));

  const response = articleListResponseSchema.parse({
    data: finalData,
    pagination: {
      page,
      pageSize,
      total,
      hasNextPage: offset + finalData.length < total
    },
    facets
  });

  // Metrics
  if (total === 0) {
    metrics.searchZeroResults.inc({ route: "/articles" });
  }
  stopTimer();

  return response;
}

export function serializeRawArticle(row: RawArticleRow) {
  return {
    id: row.id,
    feedId: row.feed_id,
    feedName: row.feed_name,
    feedCategory: row.feed_category,
    title: row.title,
    summary: row.summary,
    content: row.content,
    contentPlain: row.content,
    hasFullContent: row.content_plain_available || row.raw_content_available,
    sourceUrl: row.source_url,
    canonicalUrl: row.canonical_url,
    author: row.author,
    language: row.language,
    keywords: ensureStringArray(row.keywords),
    publishedAt: row.published_at ? row.published_at.toISOString() : null,
    fetchedAt: row.fetched_at.toISOString(),
    enrichmentStatus: row.enrichment_status,
    readingTimeSeconds: row.reading_time_seconds,
    wordCount: row.word_count,
    heroImageUrl: row.hero_image_url,
    faviconUrl: row.favicon_url,
    contentType: row.content_type,
    openGraph: ensureNullableRecord(row.open_graph),
    twitterCard: ensureNullableRecord(row.twitter_card),
    metadata: ensureNullableRecord(row.metadata),
    errorMessage: row.error_message,
    relevance: row.relevance ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

export function ensureStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return [];
}

export function ensureNullableRecord(
  value: unknown
): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}


