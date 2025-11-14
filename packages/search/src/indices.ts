import type { Client } from "@elastic/elasticsearch";
import type { AppConfig } from "@news-api/config";
import { createLogger } from "@news-api/logger";

const logger = createLogger({ name: "search" });

export function getIndexName(
  config: AppConfig,
  baseName: "articles" | "stories"
): string {
  const prefix = config.search.elasticsearch.indexPrefix;
  return `${prefix}-${baseName}-v1`;
}

export function getArticlesIndexName(config: AppConfig): string {
  return getIndexName(config, "articles");
}

export function getStoriesIndexName(config: AppConfig): string {
  return getIndexName(config, "stories");
}

const articlesMapping = {
  settings: {
    index: {
      number_of_shards: 3,
      number_of_replicas: 1
    },
    analysis: {
      analyzer: {
        title_shingle: {
          tokenizer: "standard",
          filter: ["lowercase", "asciifolding", "shingle"]
        }
      }
    }
  },
  mappings: {
    properties: {
      id: { type: "keyword" },
      feed_id: { type: "keyword" },
      source_url: { type: "keyword" },
      canonical_url: { type: "keyword" },
      title: {
        type: "text",
        fields: {
          shingles: {
            type: "text",
            analyzer: "title_shingle"
          }
        }
      },
      summary: { type: "text" },
      content: { type: "text" },
      author: { type: "keyword" },
      language: { type: "keyword" },
      keywords: { type: "keyword" },
      published_at: { type: "date" },
      fetched_at: { type: "date" },
      story_id: { type: "keyword" },
      content_hash: { type: "keyword" },
      embedding: {
        type: "dense_vector",
        dims: 384,
        index: true,
        similarity: "cosine"
      }
    }
  }
};

const storiesMapping = {
  settings: {
    index: {
      number_of_shards: 2,
      number_of_replicas: 1
    }
  },
  mappings: {
    properties: {
      story_id: { type: "keyword" },
      title_rep: { type: "text" },
      summary: { type: "text" },
      keywords: { type: "keyword" },
      sources: { type: "keyword" },
      time_range_start: { type: "date" },
      time_range_end: { type: "date" },
      centroid_embedding: {
        type: "dense_vector",
        dims: 384,
        index: true,
        similarity: "cosine"
      }
    }
  }
};

export async function bootstrapArticlesIndex(
  client: Client,
  config: AppConfig
): Promise<void> {
  const indexName = getArticlesIndexName(config);

  const exists = await client.indices.exists({ index: indexName });

  if (exists) {
    logger.info({ index: indexName }, "Articles index already exists");
    return;
  }

  await client.indices.create({
    index: indexName,
    ...articlesMapping
  });

  logger.info({ index: indexName }, "Articles index created");
}

export async function bootstrapStoriesIndex(
  client: Client,
  config: AppConfig
): Promise<void> {
  const indexName = getStoriesIndexName(config);

  const exists = await client.indices.exists({ index: indexName });

  if (exists) {
    logger.info({ index: indexName }, "Stories index already exists");
    return;
  }

  await client.indices.create({
    index: indexName,
    ...storiesMapping
  });

  logger.info({ index: indexName }, "Stories index created");
}

export async function bootstrapIndices(
  client: Client | null,
  config: AppConfig
): Promise<void> {
  if (!client) {
    logger.debug("Search disabled, skipping index bootstrap");
    return;
  }

  await Promise.all([
    bootstrapArticlesIndex(client, config),
    bootstrapStoriesIndex(client, config)
  ]);
}

export async function checkIndexHealth(
  client: Client | null,
  indexName: string
): Promise<{ exists: boolean; documentCount?: number; health?: string }> {
  if (!client) {
    return { exists: false };
  }

  try {
    const exists = await client.indices.exists({ index: indexName });
    if (!exists) {
      return { exists: false };
    }

    const stats = await client.count({ index: indexName });
    const health = await client.cluster.health({
      index: indexName,
      timeout: "5s"
    });

    return {
      exists: true,
      documentCount: stats.count,
      health: health.status
    };
  } catch (error) {
    logger.error({ error, index: indexName }, "Failed to check index health");
    return { exists: false };
  }
}

