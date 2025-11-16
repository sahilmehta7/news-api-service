import { createWorkerContext } from "../apps/worker/src/context.js";
import { processPendingArticleEnrichment } from "../apps/worker/src/jobs/enrich-articles.js";

async function main() {
  const context = await createWorkerContext();
  await processPendingArticleEnrichment(context);
  await context.indexQueue.flush();
  // eslint-disable-next-line no-console
  console.log("Enrichment tick executed once.");
  process.exit(0);
}

void main();


