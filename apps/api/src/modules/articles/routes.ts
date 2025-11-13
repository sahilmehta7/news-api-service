import type { FastifyInstance } from "fastify";
import { Prisma, ArticleStatus, EnrichmentStatus } from "@news-api/db";

import {
  articleIdSchema,
  articleListQuerySchema,
  articleListResponseSchema,
  articleResponseSchema,
  type ArticleResponse,
  articleDetailQuerySchema
} from "./schemas.js";

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

export async function registerArticleRoutes(app: FastifyInstance) {
  app.get(
    "/articles",
    {
      preHandler: app.verifyAdmin
    },
    async (request) => {
      const query = articleListQuerySchema.parse(request.query);
      const { page, pageSize, ...filters } = query;
      const offset = (page - 1) * pageSize;

      const conditions: Prisma.Sql[] = [];

      if (filters.feedId) {
        conditions.push(Prisma.sql`a.feed_id = ${filters.feedId}`);
      }

      if (filters.feedCategory) {
        conditions.push(Prisma.sql`f.category = ${filters.feedCategory}`);
      }

      if (filters.language) {
        conditions.push(
          Prisma.sql`a.language ILIKE ${filters.language as string}`
        );
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

      const searchVector = Prisma.sql`to_tsvector(
        'english',
        coalesce(a.title, '') || ' ' || coalesce(a.summary, '')
      )`;

      const relevanceExpr = filters.q
        ? Prisma.sql`ts_rank_cd(${searchVector}, plainto_tsquery('english', ${filters.q}))`
        : Prisma.sql`0`;

      if (filters.q) {
        conditions.push(
          Prisma.sql`${searchVector} @@ plainto_tsquery('english', ${filters.q})`
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
        orderExpressions.push("relevance DESC", "a.published_at DESC");
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
          ${relevanceExpr} AS relevance,
          COUNT(*) OVER() AS total
        FROM articles a
        INNER JOIN feeds f ON f.id = a.feed_id
        LEFT JOIN article_metadata am ON am.article_id = a.id
        ${whereClause}
        ${orderClause}
        LIMIT ${pageSize} OFFSET ${offset}
      `;

      const rows = await app.db.$queryRaw<RawArticleRow[]>(querySql);
      const firstRow = rows[0];
      const total =
        rows.length > 0 ? Number(firstRow?.total ?? rows.length) : 0;

      const data = rows.map(serializeRawArticle);

      return articleListResponseSchema.parse({
        data,
        pagination: {
          page,
          pageSize,
          total,
          hasNextPage: offset + data.length < total
        }
      });
    }
  );

  app.get(
    "/articles/:id",
    {
      preHandler: app.verifyAdmin
    },
    async (request, reply) => {
      const params = articleIdSchema.parse(request.params);
      const query = articleDetailQuerySchema.parse(request.query);

      const article = await app.db.article.findUnique({
        where: { id: params.id },
        include: {
          feed: {
            select: {
              name: true,
              category: true
            }
          },
          articleMetadata: true
        }
      });

      if (!article) {
        reply.code(404).send({
          error: "NotFound",
          message: `Article ${params.id} not found`
        });
        return;
      }

      return articleResponseSchema.parse(
        serializeArticleEntity(article, { includeRawHtml: query.includeRaw })
      );
    }
  );

  app.post(
    "/articles/retry-enrichment/bulk",
    {
      preHandler: app.verifyAdmin
    },
    async (_request, reply) => {
      const result = await app.db.$transaction(async (tx) => {
        const failedArticles = await tx.articleMetadata.findMany({
          where: { enrichmentStatus: EnrichmentStatus.failed },
          select: { articleId: true }
        });

        const articleIds = failedArticles
          .map((item) => item.articleId)
          .filter((id): id is string => Boolean(id));

        if (articleIds.length === 0) {
          return { updated: 0 };
        }

        await tx.articleMetadata.updateMany({
          where: { articleId: { in: articleIds } },
          data: {
            enrichmentStatus: EnrichmentStatus.pending,
            retries: 0,
            enrichedAt: null,
            errorMessage: null
          }
        });

        await tx.article.updateMany({
          where: { id: { in: articleIds } },
          data: {
            status: ArticleStatus.ingested
          }
        });

        return { updated: articleIds.length };
      });

      reply.code(202).send({
        status: "queued",
        updated: result.updated
      });
    }
  );

  app.post(
    "/articles/:id/retry-enrichment",
    {
      preHandler: app.verifyAdmin
    },
    async (request, reply) => {
      const params = articleIdSchema.parse(request.params);

      const article = await app.db.article.findUnique({
        where: { id: params.id },
        select: { id: true }
      });

      if (!article) {
        reply.code(404).send({
          error: "NotFound",
          message: `Article ${params.id} not found`
        });
        return;
      }

      await app.db.articleMetadata.upsert({
        where: { articleId: params.id },
        update: {
          enrichmentStatus: "pending",
          retries: 0,
          enrichedAt: null,
          errorMessage: null
        },
        create: {
          articleId: params.id,
          enrichmentStatus: "pending",
          retries: 0
        }
      });

      await app.db.article.update({
        where: { id: params.id },
        data: {
          status: ArticleStatus.ingested
        }
      });

      reply.code(202).send({ status: "queued" });
    }
  );
}

function serializeRawArticle(row: RawArticleRow): ArticleResponse {
  return articleResponseSchema.parse({
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
  });
}

function serializeArticleEntity(article: {
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
  feed: {
    name: string;
    category: string | null;
  };
  articleMetadata: {
    enrichmentStatus: string;
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
}, options: { includeRawHtml?: boolean } = {}): ArticleResponse {
  const meta = article.articleMetadata;

  const payload: Record<string, unknown> = {
    id: article.id,
    feedId: article.feedId,
    feedName: article.feed.name,
    feedCategory: article.feed.category,
    title: article.title,
    summary: article.summary,
    content: article.content,
    contentPlain: meta?.contentPlain ?? article.content ?? null,
    hasFullContent:
      Boolean(meta?.contentPlain) || Boolean(meta?.rawContentHtml),
    sourceUrl: article.sourceUrl,
    canonicalUrl: article.canonicalUrl,
    author: article.author,
    language: article.language,
    keywords: ensureStringArray(article.keywords),
    publishedAt: article.publishedAt
      ? article.publishedAt.toISOString()
      : null,
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
    createdAt: article.createdAt.toISOString(),
    updatedAt: article.updatedAt.toISOString()
  };

  if (options.includeRawHtml) {
    payload.rawContentHtml = meta?.rawContentHtml ?? null;
  }

  return articleResponseSchema.parse(payload);
}

function ensureStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return [];
}

function ensureNullableRecord(
  value: unknown
): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

