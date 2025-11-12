import { z } from "zod";

export const feedSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  url: z.string().url(),
  category: z.string().nullable(),
  tags: z.array(z.string()),
  isActive: z.boolean(),
  fetchIntervalMinutes: z.number().int().positive(),
  lastFetchStatus: z.string().nullable(),
  lastFetchAt: z.string().nullable(),
  metadata: z.record(z.unknown()).catch({}),
  createdAt: z.string(),
  updatedAt: z.string(),
  stats: z.object({
    articleCount: z.number().int().nonnegative(),
    lastArticlePublishedAt: z.string().nullable()
  })
});

export type Feed = z.infer<typeof feedSchema>;

export const feedInputSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  category: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  fetchIntervalMinutes: z.number().int().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional()
});

export type FeedInput = z.infer<typeof feedInputSchema>;

export const articleSchema = z.object({
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
  publishedAt: z.string().nullable(),
  fetchedAt: z.string(),
  enrichmentStatus: z.string().nullable(),
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
  createdAt: z.string(),
  updatedAt: z.string()
});

export type Article = z.infer<typeof articleSchema>;

export const articleListResponseSchema = z.object({
  data: z.array(articleSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    hasNextPage: z.boolean()
  })
});

export type ArticleListResponse = z.infer<typeof articleListResponseSchema>;

export const feedListResponseSchema = z.object({
  feeds: z.array(feedSchema)
});

export const logEntrySchema = z.object({
  id: z.string().uuid(),
  feedId: z.string().uuid(),
  feedName: z.string().nullable(),
  status: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().nullable(),
  errorMessage: z.string().nullable(),
  errorStack: z.string().nullable(),
  metrics: z.record(z.unknown()).catch({}),
  context: z.record(z.unknown()).catch({})
});

export type LogEntry = z.infer<typeof logEntrySchema>;

export const logListResponseSchema = z.object({
  data: z.array(logEntrySchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    hasNextPage: z.boolean()
  })
});

