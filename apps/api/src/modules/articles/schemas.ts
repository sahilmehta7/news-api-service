import { z } from "zod";

export const articleListQuerySchema = z
  .object({
    page: z
      .string()
      .optional()
      .transform((value) => (value ? Number(value) : 1))
      .pipe(
        z
          .number()
          .int()
          .positive()
          .default(1)
      ),
    pageSize: z
      .string()
      .optional()
      .transform((value) => (value ? Number(value) : 20))
      .pipe(
        z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
      ),
    feedId: z.string().uuid().optional(),
    feedCategory: z.string().optional(),
    language: z.string().optional(),
    fromDate: z
      .string()
      .optional()
      .transform((value) => (value ? new Date(value) : undefined)),
    toDate: z
      .string()
      .optional()
      .transform((value) => (value ? new Date(value) : undefined)),
    enrichmentStatus: z
      .enum(["pending", "processing", "success", "failed"])
      .optional(),
    hasMedia: z
      .string()
      .optional()
      .transform((value) => {
        if (value === undefined) return undefined;
        return ["true", "1", "yes"].includes(value.toLowerCase());
      }),
    q: z.string().optional(),
    sort: z
      .enum(["publishedAt", "fetchedAt", "relevance"])
      .optional()
      .default("publishedAt"),
    order: z
      .enum(["asc", "desc"])
      .optional()
      .default("desc"),
    keywords: z
      .string()
      .optional()
      .transform((value) =>
        value
          ? value
              .split(",")
              .map((keyword) => keyword.trim())
              .filter(Boolean)
          : []
      )
  })
  .transform((value) => ({
    ...value,
    page: value.page ?? 1,
    pageSize: value.pageSize ?? 20
  }));

export const articleIdSchema = z.object({
  id: z.string().uuid()
});

export const articleResponseSchema = z.object({
  id: z.string().uuid(),
  feedId: z.string().uuid(),
  feedName: z.string(),
  feedCategory: z.string().nullable(),
  title: z.string(),
  summary: z.string().nullable(),
  content: z.string().nullable(),
  sourceUrl: z.string(),
  canonicalUrl: z.string().nullable(),
  author: z.string().nullable(),
  language: z.string().nullable(),
  keywords: z.array(z.string()),
  publishedAt: z.string().datetime().nullable(),
  fetchedAt: z.string().datetime(),
  enrichmentStatus: z
    .enum(["pending", "processing", "success", "failed"])
    .nullable(),
  readingTimeSeconds: z.number().nullable(),
  wordCount: z.number().nullable(),
  heroImageUrl: z.string().nullable(),
  faviconUrl: z.string().nullable(),
  contentType: z.string().nullable(),
  openGraph: z.record(z.unknown()).nullable(),
  twitterCard: z.record(z.unknown()).nullable(),
  metadata: z.record(z.unknown()).nullable(),
  errorMessage: z.string().nullable(),
  relevance: z.number().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const articleListResponseSchema = z.object({
  data: z.array(articleResponseSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    hasNextPage: z.boolean()
  })
});

export type ArticleResponse = z.infer<typeof articleResponseSchema>;

