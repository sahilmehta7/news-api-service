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
    },
          search: {
            enabled: coerceBoolean(env.SEARCH_ENABLED),
            elasticsearch: {
              node: env.ELASTICSEARCH_NODE,
              username: env.ELASTICSEARCH_USERNAME,
              password: env.ELASTICSEARCH_PASSWORD,
              indexPrefix: env.ELASTICSEARCH_INDEX_PREFIX,
              defaultLanguage: env.SEARCH_DEFAULT_LANGUAGE
            }
          },
          clustering: {
            enabled: coerceBoolean(env.CLUSTERING_ENABLED ?? "true"),
            reclusterIntervalMs: env.CLUSTERING_RECLUSTER_INTERVAL_MS,
            windowHours: env.CLUSTERING_WINDOW_HOURS,
            mergeSimilarityThreshold: env.CLUSTERING_MERGE_SIMILARITY_THRESHOLD,
            splitCohesionThreshold: env.CLUSTERING_SPLIT_COHESION_THRESHOLD,
            minClusterSizeForSplit: env.CLUSTERING_MIN_CLUSTER_SIZE_FOR_SPLIT,
            cosineWeight: env.CLUSTERING_COSINE_WEIGHT,
            jaccardWeight: env.CLUSTERING_JACCARD_WEIGHT,
            entityWeight: env.CLUSTERING_ENTITY_WEIGHT
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

