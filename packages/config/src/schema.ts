import { z } from "zod";

const serverSchema = z.object({
  host: z.string().default("0.0.0.0"),
  port: z.coerce.number().int().min(0).max(65535).default(3000)
});

const databaseSchema = z.object({
  url: z.string().url(),
  schema: z.string().default("public")
});

const apiSchema = z.object({
  adminKey: z
    .string()
    .min(16, "API admin key must be at least 16 characters")
    .default("dev-admin-key-change-me")
});

const monitoringSchema = z.object({
  enabled: z.coerce.boolean().default(true),
  metricsPort: z.coerce.number().int().min(1).max(65535).default(9300),
  metricsHost: z.string().default("0.0.0.0")
});

const searchSchema = z.object({
  enabled: z.coerce.boolean().default(false),
  embeddingDims: z.coerce.number().int().positive().default(768),
  indexVersion: z.coerce.number().int().positive().default(2),
  elasticsearch: z.object({
    node: z.string().url().default("http://localhost:9200"),
    username: z.string().optional(),
    password: z.string().optional(),
    indexPrefix: z.string().default("news"),
    defaultLanguage: z.string().default("english")
  })
});

export const configSchema = z.object({
  nodeEnv: z
    .enum(["development", "test", "production"])
    .default("development"),
  server: serverSchema,
  database: databaseSchema,
  api: apiSchema,
  ingestion: z.object({
    concurrency: z.coerce.number().int().positive().default(5),
    defaultFetchIntervalMinutes: z
      .coerce.number()
      .int()
      .positive()
      .default(30),
    fetchTimeoutMs: z.coerce.number().int().positive().default(10_000),
    pollIntervalMs: z
      .coerce.number()
      .int()
      .min(1_000, "Poll interval must be at least 1 second")
      .default(30_000)
  }),
  enrichment: z.object({
    concurrency: z.coerce.number().int().positive().default(5),
    timeoutMs: z.coerce.number().int().positive().default(10_000)
  }),
  monitoring: monitoringSchema,
  search: searchSchema,
  clustering: z.object({
    enabled: z.coerce.boolean().default(true),
    reclusterIntervalMs: z.coerce.number().int().positive().default(20 * 60 * 1000), // 20 minutes
    windowHours: z.coerce.number().int().positive().default(72),
    mergeSimilarityThreshold: z.coerce.number().min(0).max(1).default(0.85),
    splitCohesionThreshold: z.coerce.number().min(0).max(1).default(0.75),
    minClusterSizeForSplit: z.coerce.number().int().positive().default(5),
    cosineWeight: z.coerce.number().min(0).max(1).default(0.7),
    jaccardWeight: z.coerce.number().min(0).max(1).default(0.2),
    entityWeight: z.coerce.number().min(0).max(1).default(0.1)
  })
});

export type AppConfig = z.infer<typeof configSchema>;

