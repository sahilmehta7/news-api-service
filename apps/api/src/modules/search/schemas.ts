import { z } from "zod";

export const searchQuerySchema = z.object({
  q: z.string().optional(),
  from: z
    .string()
    .optional()
    .transform((value) => (value ? new Date(value) : undefined)),
  to: z
    .string()
    .optional()
    .transform((value) => (value ? new Date(value) : undefined)),
  language: z.string().optional(),
  feedId: z.string().uuid().optional(),
  size: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : 20))
    .pipe(z.number().int().min(1).max(100).default(20)),
  offset: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : 0))
    .pipe(z.number().int().min(0).default(0)),
  groupByStory: z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined) return false;
      return ["true", "1", "yes"].includes(value.toLowerCase());
    })
    .pipe(z.boolean().default(false))
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const storyListQuerySchema = z.object({
  q: z.string().optional(),
  from: z
    .string()
    .optional()
    .transform((value) => (value ? new Date(value) : undefined)),
  to: z
    .string()
    .optional()
    .transform((value) => (value ? new Date(value) : undefined)),
  language: z.string().optional(),
  size: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : 20))
    .pipe(z.number().int().min(1).max(100).default(20)),
  offset: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : 0))
    .pipe(z.number().int().min(0).default(0))
});

export type StoryListQuery = z.infer<typeof storyListQuerySchema>;

export const storyDetailQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : 1))
    .pipe(z.number().int().positive().default(1)),
  pageSize: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : 20))
    .pipe(z.number().int().min(1).max(100).default(20))
});

export type StoryDetailQuery = z.infer<typeof storyDetailQuerySchema>;

