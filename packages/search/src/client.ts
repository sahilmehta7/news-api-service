import { Client } from "@elastic/elasticsearch";
import type { AppConfig } from "@news-api/config";
import { createLogger } from "@news-api/logger";

const logger = createLogger({ name: "search" });

export function createElasticsearchClient(config: AppConfig): Client | null {
  if (!config.search.enabled) {
    logger.debug("Search is disabled, skipping Elasticsearch client creation");
    return null;
  }

  const { node, username, password } = config.search.elasticsearch;

  const clientConfig: {
    node: string;
    auth?: { username: string; password: string };
  } = {
    node
  };

  if (username && password) {
    clientConfig.auth = { username, password };
  }

  const client = new Client(clientConfig);

  logger.info({ node }, "Elasticsearch client created");

  return client;
}

export async function checkElasticsearchHealth(
  client: Client | null
): Promise<{ status: "ok" | "unavailable" | "error"; message?: string }> {
  if (!client) {
    return { status: "unavailable", message: "Search is disabled" };
  }

  try {
    const response = await client.cluster.health({ timeout: "5s" });
    return {
      status: response.status === "green" || response.status === "yellow" ? "ok" : "error",
      message: `Cluster status: ${response.status}`
    };
  } catch (error) {
    logger.error({ error }, "Elasticsearch health check failed");
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

