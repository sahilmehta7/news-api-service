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

export { expandQueryWithSynonyms } from "./synonyms/loader.js";
export { rerankCandidates, type RerankerCandidate } from "./rerank.js";
