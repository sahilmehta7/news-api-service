import { config as loadDotenv } from "dotenv";
import type { ZodIssue } from "zod";

import { configSchema, type AppConfig } from "./schema.js";

let cachedConfig: AppConfig | null = null;

function coerceBoolean(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.toLowerCase();
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  return undefined;
}

export function loadConfig(options: { env?: NodeJS.ProcessEnv } = {}): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  loadDotenv();

  const env = options.env ?? process.env;

  const result = configSchema.safeParse({
    nodeEnv: env.NODE_ENV,
    server: {
      host: env.SERVER_HOST,
      port: env.SERVER_PORT
    },
    database: {
      url: env.DATABASE_URL,
      schema: env.DATABASE_SCHEMA
    },
    api: {
      adminKey: env.API_ADMIN_KEY
    },
    ingestion: {
      concurrency: env.INGESTION_CONCURRENCY,
      defaultFetchIntervalMinutes: env.INGESTION_DEFAULT_FETCH_INTERVAL_MINUTES,
      fetchTimeoutMs: env.INGESTION_FETCH_TIMEOUT_MS,
      pollIntervalMs: env.INGESTION_POLL_INTERVAL_MS
    },
    enrichment: {
      concurrency: env.ENRICHMENT_CONCURRENCY,
      timeoutMs: env.ENRICHMENT_TIMEOUT_MS
    },
    monitoring: {
      enabled: coerceBoolean(env.MONITORING_ENABLED),
      metricsPort: env.MONITORING_METRICS_PORT,
      metricsHost: env.MONITORING_METRICS_HOST
    }
  });

  if (!result.success) {
    const formattedErrors = result.error.issues
      .map((issue: ZodIssue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ");
    throw new Error(`Invalid configuration: ${formattedErrors}`);
  }

  cachedConfig = result.data;
  return cachedConfig;
}

