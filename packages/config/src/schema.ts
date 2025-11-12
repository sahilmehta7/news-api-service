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
  monitoring: monitoringSchema
});

export type AppConfig = z.infer<typeof configSchema>;

