import { z } from "zod";

export const feedIdSchema = z.object({
  id: z.string().uuid()
});

const metadataSchema = z
  .record(z.string(), z.unknown())
  .default({})
  .catch({});

const sourceSchema = z.object({
  id: z.string().uuid(),
  baseUrl: z.string().url(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const createFeedSchema = z.object({
  name: z.string().min(1, "Feed name is required"),
  url: z.string().url("Feed URL must be valid"),
  category: z.string().optional(),
  tags: z.array(z.string().min(1)).default([]).optional(),
  fetchIntervalMinutes: z
    .number()
    .int()
    .positive()
    .max(24 * 60, "Interval cannot exceed 24 hours")
    .default(30)
    .optional(),
  metadata: metadataSchema.optional(),
  isActive: z.boolean().optional()
});

export const updateFeedSchema = createFeedSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update"
  });

export const feedResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  url: z.string().url(),
  category: z.string().nullable(),
  tags: z.array(z.string()),
  isActive: z.boolean(),
  fetchIntervalMinutes: z.number().int().positive(),
  lastFetchStatus: z.string().nullable(),
  lastFetchAt: z.string().datetime().nullable(),
  metadata: metadataSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  source: sourceSchema.nullable(),
  stats: z.object({
    articleCount: z.number().int().nonnegative(),
    lastArticlePublishedAt: z.string().datetime().nullable()
  })
});

export type FeedResponse = z.infer<typeof feedResponseSchema>;

const stringArrayFromQuery = z
  .union([z.string(), z.array(z.string())])
  .transform((value) => {
    if (!value) return [];
    return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
  })
  .pipe(z.array(z.string()).default([]));

const booleanFromQuery = z
  .string()
  .transform((value) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return undefined;
  })
  .optional();

const lastFetchStatuses = ["idle", "fetching", "success", "warning", "error"] as const;

export type FeedSortField = "name" | "createdAt" | "lastFetchAt" | "articleCount";

export const feedListQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? value : undefined))
    .optional(),
  categories: stringArrayFromQuery.optional(),
  tags: stringArrayFromQuery.optional(),
  lastFetchStatuses: stringArrayFromQuery
    .transform((values) =>
      values.filter((value): value is (typeof lastFetchStatuses)[number] =>
        (lastFetchStatuses as readonly string[]).includes(value)
      )
    )
    .optional(),
  isActive: booleanFromQuery,
  hasIssues: z
    .string()
    .transform((value) => {
      if (value === "true") return true;
      if (value === "false") return false;
      return undefined;
    })
    .optional(),
  sort: z
    .string()
    .transform((value) =>
      (["name", "createdAt", "lastFetchAt", "articleCount"] as const).includes(
        value as FeedSortField
      )
        ? (value as FeedSortField)
        : undefined
    )
    .default("createdAt"),
  order: z
    .enum(["asc", "desc"])
    .default("desc"),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  cursor: z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? value : undefined))
    .optional()
});

export type FeedListQuery = z.infer<typeof feedListQuerySchema>;

export const feedListResponseSchema = z.object({
  data: z.array(feedResponseSchema),
  pagination: z.object({
    limit: z.number().int().positive(),
    nextCursor: z.string().nullable(),
    hasNextPage: z.boolean(),
    total: z.number().int().nonnegative()
  }),
  summary: z.object({
    totalFeeds: z.number().int().nonnegative(),
    activeFeeds: z.number().int().nonnegative(),
    inactiveFeeds: z.number().int().nonnegative(),
    issueFeeds: z.number().int().nonnegative(),
    totalArticles: z.number().int().nonnegative()
  }),
  facets: z.object({
    categories: z.array(z.string()),
    tags: z.array(z.string())
  })
});

export type FeedListResponse = z.infer<typeof feedListResponseSchema>;

export const bulkImportFeedsSchema = z
  .union([
    z.object({
      feeds: z.array(createFeedSchema)
    }),
    z.array(createFeedSchema)
  ])
  .transform((value) => (Array.isArray(value) ? value : value.feeds))
  .refine((feeds) => feeds.length > 0, {
    message: "At least one feed must be provided for import"
  });

export type BulkImportFeedInput = z.infer<typeof createFeedSchema>;

