const DEFAULT_EMBEDDING_DIMENSIONS = 768;

export function getEmbeddingDimensions(): number {
  const raw = process.env.EMBEDDING_DIMENSIONS;
  if (!raw) return DEFAULT_EMBEDDING_DIMENSIONS;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_EMBEDDING_DIMENSIONS;
  }
  return parsed;
}


