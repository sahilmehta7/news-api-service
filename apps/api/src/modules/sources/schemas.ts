import { z } from "zod";

export const sourceResponseSchema = z.object({
  id: z.string().uuid(),
  baseUrl: z.string().url(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  stats: z.object({
    feedCount: z.number().int().nonnegative(),
    activeFeedCount: z.number().int().nonnegative()
  })
});

export type SourceResponse = z.infer<typeof sourceResponseSchema>;

export const sourceListResponseSchema = z.object({
  data: z.array(sourceResponseSchema),
  pagination: z.object({
    limit: z.number().int().positive(),
    nextCursor: z.string().nullable(),
    hasNextPage: z.boolean(),
    total: z.number().int().nonnegative()
  })
});

export type SourceListResponse = z.infer<typeof sourceListResponseSchema>;

const sourceSortFields = ["baseUrl", "createdAt", "updatedAt"] as const;

export type SourceSortField = (typeof sourceSortFields)[number];

export const sourceListQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? value : undefined))
    .optional(),
  hasFeeds: z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      return value === "true" || value === "1" || value === "yes";
    })
    .pipe(z.boolean().optional()),
  sort: z
    .string()
    .transform((value) =>
      (sourceSortFields as readonly string[]).includes(value)
        ? (value as SourceSortField)
        : undefined
    )
    .default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? value : undefined))
    .optional()
});

export type SourceListQuery = z.infer<typeof sourceListQuerySchema>;

