import { createElasticsearchClient } from "@news-api/search";
import { loadConfig } from "@news-api/config";
import { bootstrapIndices } from "@news-api/search";

async function main() {
  const config = loadConfig();
  const client = createElasticsearchClient(config);
  await bootstrapIndices(client, config);
  // eslint-disable-next-line no-console
  console.log("Search indices bootstrapped.");
}

void main();


