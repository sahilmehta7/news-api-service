import type { FastifyInstance } from "fastify";
import type { AppConfig } from "@news-api/config";
import {
  createElasticsearchClient,
  checkElasticsearchHealth,
  checkIndexHealth,
  getArticlesIndexName,
  getStoriesIndexName
} from "@news-api/search";
import type { SearchSettingsResponse } from "./schemas.js";

export async function getSearchSettings(
  app: FastifyInstance,
  config: AppConfig
): Promise<SearchSettingsResponse> {
  const searchClient = createElasticsearchClient(config);
  const esHealth = await checkElasticsearchHealth(searchClient);

  const articlesIndexName = getArticlesIndexName(config);
  const storiesIndexName = getStoriesIndexName(config);

  const [articlesHealth, storiesHealth] = await Promise.all([
    checkIndexHealth(searchClient, articlesIndexName),
    checkIndexHealth(searchClient, storiesIndexName)
  ]);

  // Get cluster status if available
  let clusterStatus: string | undefined;
  if (searchClient && esHealth.status === "ok") {
    try {
      const clusterHealth = await searchClient.cluster.health({ timeout: "5s" });
      clusterStatus = clusterHealth.status;
    } catch {
      // Ignore errors, clusterStatus will remain undefined
    }
  }

  return {
    searchEnabled: config.search.enabled,
    elasticsearch: {
      node: config.search.elasticsearch.node,
      indexPrefix: config.search.elasticsearch.indexPrefix,
      defaultLanguage: config.search.elasticsearch.defaultLanguage,
      hasAuth: !!(config.search.elasticsearch.username && config.search.elasticsearch.password)
    },
    health: {
      status: esHealth.status,
      message: esHealth.message,
      clusterStatus
    },
    indices: {
      articles: {
        exists: articlesHealth.exists,
        documentCount: articlesHealth.documentCount,
        health: articlesHealth.health
      },
      stories: {
        exists: storiesHealth.exists,
        documentCount: storiesHealth.documentCount,
        health: storiesHealth.health
      }
    }
  };
}

