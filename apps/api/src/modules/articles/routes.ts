import type { FastifyInstance } from "fastify";
import { ArticleStatus, EnrichmentStatus } from "@news-api/db";

import {
  articleIdSchema,
  articleListQuerySchema,
  articleListResponseSchema,
  articleResponseSchema,
  type ArticleResponse,
  articleDetailQuerySchema,
  articleHighlightsQuerySchema,
  articleHighlightsResponseSchema
} from "./schemas.js";
import {
  ensureNullableRecord,
  ensureStringArray,
  listArticles
} from "./service.js";

export async function registerArticleRoutes(app: FastifyInstance) {
  app.get(
    "/articles/highlights",
    {
      preHandler: app.verifyAdmin
    },
    async (request) => {
      const query = articleHighlightsQuerySchema.parse(request.query);
      const offsetMs = HIGHLIGHT_WINDOW_OFFSETS[query.window];
      const since = new Date(Date.now() - offsetMs);

      const [
        ingested,
        enriched,
        pendingEnrichment,
        languageGroups
      ] = await Promise.all([
        app.db.article.count({
          where: {
            fetchedAt: {
              gte: since
            }
          }
        }),
        app.db.articleMetadata.count({
          where: {
            enrichmentStatus: EnrichmentStatus.success,
            enrichedAt: {
              gte: since
            }
          }
        }),
        app.db.articleMetadata.count({
          where: {
            enrichmentStatus: {
              in: [EnrichmentStatus.pending, EnrichmentStatus.processing]
            }
          }
        }),
        app.db.article.groupBy({
          by: ["language"],
          where: {
            fetchedAt: {
              gte: since
            },
            language: {
              not: null
            }
          },
          _count: {
            _all: true,
            language: true
          },
          orderBy: {
            _count: {
              language: "desc"
            }
          },
          take: 5
        })
      ]);

      const topLanguages = languageGroups.map((group) => ({
        language: group.language ?? "unknown",
        count: group._count.language ?? 0
      }));

      return articleHighlightsResponseSchema.parse({
        ingested,
        enriched,
        pendingEnrichment,
        topLanguages
      });
    }
  );

  app.get(
    "/articles",
    {
      preHandler: app.verifyAdmin
    },
    async (request) => {
      const query = articleListQuerySchema.parse(request.query);
      return listArticles(app, query);
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

const HIGHLIGHT_WINDOW_OFFSETS = {
  "12h": 12 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000
} as const;

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
