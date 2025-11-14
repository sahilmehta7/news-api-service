# Phase 6 Implementation Summary: Advanced Clustering Features

## Overview

Phase 6 enhances the clustering algorithm with advanced similarity signals beyond cosine similarity of embeddings. This includes Jaccard similarity for title shingles and named entity overlap detection, combined into a weighted similarity score.

## Completed Features

### 1. Jaccard Similarity for Title Shingles

**File:** `apps/worker/src/lib/search/similarity.ts`

**Implementation:**
- `extractShingles(text, n)`: Extracts n-grams (shingles) from text
  - Default: bigrams (2-word sequences) and trigrams (3-word sequences)
  - Normalizes text (lowercase, removes punctuation)
  - Filters empty words

- `jaccardSimilarity(setA, setB)`: Computes Jaccard index
  - Formula: |A ∩ B| / |A ∪ B|
  - Returns value between 0 and 1

- `titleJaccardSimilarity(titleA, titleB)`: Specialized for titles
  - Extracts both bigrams and trigrams
  - Computes weighted average: 0.6 * bigramJaccard + 0.4 * trigramJaccard
  - Bigrams weighted more heavily as they capture more general patterns

### 2. Named Entity Overlap

**File:** `apps/worker/src/lib/search/similarity.ts`

**Implementation:**
- `extractNamedEntities(text)`: Extracts named entities using regex patterns
  - **Person names**: Capitalized 2-3 word sequences (filters common words)
  - **Organization names**: Patterns like "Company Inc", "Corp", "LLC", etc.
  - **Location names**: Capitalized multi-word phrases (2+ words, all capitalized)

- `entityOverlap(textA, textB)`: Computes entity overlap ratio
  - Extracts entities from both texts
  - Uses Jaccard similarity of entity sets
  - Returns value between 0 and 1

**Design Decisions:**
- Lightweight regex-based approach (no external dependencies)
- Focuses on common patterns to minimize false positives
- Can be enhanced with NLP libraries (`@xenova/transformers`, `compromise`, `natural`) in the future

### 3. Combined Similarity Score

**File:** `apps/worker/src/lib/search/similarity.ts`

**Implementation:**
- `combinedSimilarity(cosineSim, jaccardSim, entitySim, weights)`: Computes weighted average
  - Default weights: 0.7 cosine, 0.2 jaccard, 0.1 entity
  - Normalizes weights to sum to 1.0
  - Returns combined score between 0 and 1

**Integration:**
- Modified `assignStoryId()` in `apps/worker/src/lib/search/clustering.ts`:
  1. Fetches `title` and `content` from Elasticsearch (in addition to existing fields)
  2. Computes cosine similarity first (fast, filters candidates)
  3. Only computes Jaccard/entity similarity for candidates with cosine >= 0.9 * threshold
  4. Computes combined similarity score
  5. Uses effective threshold (95% of base threshold) for final filtering

**Performance Optimization:**
- Two-stage filtering:
  - Stage 1: Cosine similarity >= 0.9 * threshold (filters ~90% of candidates)
  - Stage 2: Combined similarity >= 0.95 * threshold (final filtering)
- This avoids expensive Jaccard/entity computations for clearly dissimilar articles

### 4. Configuration

**Files Modified:**
- `packages/config/src/schema.ts`: Added `cosineWeight`, `jaccardWeight`, `entityWeight` to clustering config
- `packages/config/src/load-config.ts`: Added environment variable loading

**Environment Variables:**
- `CLUSTERING_COSINE_WEIGHT`: Weight for cosine similarity (default: 0.7)
- `CLUSTERING_JACCARD_WEIGHT`: Weight for Jaccard similarity (default: 0.2)
- `CLUSTERING_ENTITY_WEIGHT`: Weight for entity overlap (default: 0.1)

**Note:** Weights are normalized automatically, so they don't need to sum to 1.0

## Files Created

1. `apps/worker/src/lib/search/similarity.ts`: All similarity utilities

## Files Modified

1. `apps/worker/src/lib/search/clustering.ts`: Integrated combined similarity
2. `packages/config/src/schema.ts`: Added similarity weight configuration
3. `packages/config/src/load-config.ts`: Added environment variable loading

## Algorithm Flow

```
1. Fetch candidates via k-NN search (cosine similarity on embeddings)
2. For each candidate:
   a. Compute cosine similarity (fast)
   b. If cosine >= 0.9 * threshold:
      - Extract title shingles (bigrams + trigrams)
      - Compute Jaccard similarity
      - Extract named entities
      - Compute entity overlap
      - Compute combined similarity (weighted average)
      - If combined >= 0.95 * threshold: add to candidates
3. Group candidates by existing storyId
4. Assign to most common story, or create new story
```

## Benefits

1. **Improved Accuracy**: Multiple signals reduce false positives/negatives
2. **Title-Based Matching**: Catches articles with similar titles but different embeddings
3. **Entity Awareness**: Groups articles mentioning same people/organizations/locations
4. **Configurable**: Weights can be tuned for different use cases
5. **Performance**: Two-stage filtering minimizes expensive computations

## Testing Recommendations

1. **Unit Tests:**
   - Test `extractShingles()` with various inputs
   - Test `jaccardSimilarity()` with edge cases (empty sets, identical sets)
   - Test `extractNamedEntities()` with various text patterns
   - Test `combinedSimilarity()` with different weight configurations

2. **Integration Tests:**
   - Test clustering with articles that have:
     - Similar titles but different content
     - Same entities but different wording
     - High cosine similarity but low Jaccard/entity overlap

3. **Performance Tests:**
   - Measure impact of Jaccard/entity computation on clustering time
   - Verify two-stage filtering reduces computation

## Future Enhancements

1. **Enhanced Entity Extraction:**
   - Use NLP libraries for more accurate entity recognition
   - Support for more entity types (dates, events, products)
   - Entity disambiguation (e.g., "Apple" company vs. fruit)

2. **Additional Similarity Signals:**
   - Keyword overlap
   - Source domain similarity
   - Temporal proximity (articles published close together)

3. **Adaptive Weights:**
   - Learn optimal weights from labeled data
   - Adjust weights based on article characteristics
   - A/B testing framework for weight optimization

4. **Caching:**
   - Cache shingle extraction results
   - Cache entity extraction results
   - Cache similarity computations for frequently compared articles

## Configuration Example

```bash
# Default weights (sum to 1.0 after normalization)
CLUSTERING_COSINE_WEIGHT=0.7
CLUSTERING_JACCARD_WEIGHT=0.2
CLUSTERING_ENTITY_WEIGHT=0.1

# Emphasize title similarity
CLUSTERING_COSINE_WEIGHT=0.5
CLUSTERING_JACCARD_WEIGHT=0.4
CLUSTERING_ENTITY_WEIGHT=0.1

# Emphasize entity overlap
CLUSTERING_COSINE_WEIGHT=0.6
CLUSTERING_JACCARD_WEIGHT=0.1
CLUSTERING_ENTITY_WEIGHT=0.3
```

