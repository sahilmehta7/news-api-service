/**
 * Similarity utilities for advanced clustering features
 */

/**
 * Extract shingles (n-grams) from text
 * @param text Input text
 * @param n Shingle size (default: 2 for bigrams, 3 for trigrams)
 * @returns Set of lowercase shingles
 */
export function extractShingles(text: string, n = 2): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0);

  const shingles = new Set<string>();

  for (let i = 0; i <= words.length - n; i++) {
    const shingle = words.slice(i, i + n).join(" ");
    if (shingle.trim().length > 0) {
      shingles.add(shingle);
    }
  }

  return shingles;
}

/**
 * Compute Jaccard similarity between two sets
 * Jaccard index = |A ∩ B| / |A ∪ B|
 */
export function jaccardSimilarity<T>(setA: Set<T>, setB: Set<T>): number {
  if (setA.size === 0 && setB.size === 0) {
    return 1.0;
  }

  const intersection = new Set<T>();
  for (const item of setA) {
    if (setB.has(item)) {
      intersection.add(item);
    }
  }

  const union = new Set<T>([...setA, ...setB]);

  if (union.size === 0) {
    return 0;
  }

  return intersection.size / union.size;
}

/**
 * Compute Jaccard similarity for title shingles
 * Extracts both bigrams and trigrams and computes weighted average
 */
export function titleJaccardSimilarity(
  titleA: string,
  titleB: string
): number {
  if (!titleA || !titleB) {
    return 0;
  }

  const bigramsA = extractShingles(titleA, 2);
  const bigramsB = extractShingles(titleB, 2);
  const trigramsA = extractShingles(titleA, 3);
  const trigramsB = extractShingles(titleB, 3);

  const bigramJaccard = jaccardSimilarity(bigramsA, bigramsB);
  const trigramJaccard = jaccardSimilarity(trigramsA, trigramsB);

  // Weighted average: bigrams are more important (0.6) than trigrams (0.4)
  return 0.6 * bigramJaccard + 0.4 * trigramJaccard;
}

/**
 * Extract named entities from text using simple regex patterns
 * This is a lightweight approach - for production, consider using NLP libraries
 */
export function extractNamedEntities(text: string): Set<string> {
  const entities = new Set<string>();
  const lowerText = text.toLowerCase();

  // Patterns for common named entities
  // Person names (capitalized words, 2-3 words, common patterns)
  const personPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g;
  const personMatches = text.match(personPattern);
  if (personMatches) {
    for (const match of personMatches) {
      // Filter out common false positives
      const commonWords = [
        "the",
        "and",
        "or",
        "but",
        "in",
        "on",
        "at",
        "to",
        "for",
        "of",
        "with",
        "by"
      ];
      const words = match.split(/\s+/);
      if (
        words.length >= 2 &&
        !words.some((w) => commonWords.includes(w.toLowerCase()))
      ) {
        entities.add(match.toLowerCase());
      }
    }
  }

  // Organization names (common patterns: "Company Inc", "Corp", "LLC", etc.)
  const orgPattern = /\b([A-Z][a-z]+(?:\s+(?:Inc|Corp|LLC|Ltd|Co|Company|Corporation|Group|Systems|Technologies|Tech)))\b/gi;
  const orgMatches = text.match(orgPattern);
  if (orgMatches) {
    for (const match of orgMatches) {
      entities.add(match.toLowerCase());
    }
  }

  // Location names (common patterns: "City, State", "Country", etc.)
  // This is simplified - real NER would be more sophisticated
  const locationPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
  const locationMatches = text.match(locationPattern);
  if (locationMatches) {
    // Filter to likely locations (heuristic: longer capitalized phrases)
    for (const match of locationMatches) {
      const words = match.split(/\s+/);
      if (words.length >= 2 && words.every((w) => /^[A-Z]/.test(w))) {
        entities.add(match.toLowerCase());
      }
    }
  }

  return entities;
}

/**
 * Compute entity overlap ratio between two texts
 * Returns the Jaccard similarity of extracted entities
 */
export function entityOverlap(textA: string, textB: string): number {
  if (!textA || !textB) {
    return 0;
  }

  const entitiesA = extractNamedEntities(textA);
  const entitiesB = extractNamedEntities(textB);

  if (entitiesA.size === 0 && entitiesB.size === 0) {
    return 0; // No entities found in either text
  }

  return jaccardSimilarity(entitiesA, entitiesB);
}

/**
 * Combined similarity score using multiple signals
 * @param cosineSim Cosine similarity of embeddings (0-1)
 * @param jaccardSim Jaccard similarity of title shingles (0-1)
 * @param entitySim Entity overlap ratio (0-1)
 * @param weights Optional weights for each signal (default: 0.7, 0.2, 0.1)
 * @returns Combined similarity score (0-1)
 */
export function combinedSimilarity(
  cosineSim: number,
  jaccardSim: number,
  entitySim: number,
  weights: { cosine: number; jaccard: number; entity: number } = {
    cosine: 0.7,
    jaccard: 0.2,
    entity: 0.1
  }
): number {
  // Normalize weights
  const totalWeight = weights.cosine + weights.jaccard + weights.entity;
  const normalizedWeights = {
    cosine: weights.cosine / totalWeight,
    jaccard: weights.jaccard / totalWeight,
    entity: weights.entity / totalWeight
  };

  return (
    normalizedWeights.cosine * cosineSim +
    normalizedWeights.jaccard * jaccardSim +
    normalizedWeights.entity * entitySim
  );
}

