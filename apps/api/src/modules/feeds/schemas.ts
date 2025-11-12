import { z } from "zod";

export const feedIdSchema = z.object({
  id: z.string().uuid()
});

const metadataSchema = z
  .record(z.string(), z.unknown())
  .default({})
  .catch({});

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
  stats: z.object({
    articleCount: z.number().int().nonnegative(),
    lastArticlePublishedAt: z.string().datetime().nullable()
  })
});

export type FeedResponse = z.infer<typeof feedResponseSchema>;

