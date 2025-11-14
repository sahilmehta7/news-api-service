import { z } from "zod";

export const searchSettingsResponseSchema = z.object({
  searchEnabled: z.boolean(),
  elasticsearch: z.object({
    node: z.string().url(),
    indexPrefix: z.string(),
    defaultLanguage: z.string(),
    hasAuth: z.boolean()
  }),
  health: z.object({
    status: z.enum(["ok", "unavailable", "error"]),
    message: z.string().optional(),
    clusterStatus: z.string().optional()
  }),
  indices: z.object({
    articles: z.object({
      exists: z.boolean(),
      documentCount: z.number().optional(),
      health: z.string().optional()
    }),
    stories: z.object({
      exists: z.boolean(),
      documentCount: z.number().optional(),
      health: z.string().optional()
    })
  })
});

export type SearchSettingsResponse = z.infer<typeof searchSettingsResponseSchema>;

