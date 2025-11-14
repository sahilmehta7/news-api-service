export { createElasticsearchClient, checkElasticsearchHealth } from "./client.js";
export {
  getArticlesIndexName,
  getStoriesIndexName,
  getIndexName,
  bootstrapIndices,
  bootstrapArticlesIndex,
  bootstrapStoriesIndex,
  checkIndexHealth
} from "./indices.js";
export type { ArticleDocument, StoryDocument, IndexHealth } from "./types.js";

