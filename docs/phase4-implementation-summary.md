# Phase 4: Enhanced Search Features - Implementation Summary

## Overview

Phase 4 implements true hybrid search with BM25 + k-NN union, enhanced story diversification, and query embedding computation using the embedding provider.

## Files Created/Modified

### New Files

- **`apps/api/src/plugins/embeddings.ts`**
  - Fastify plugin to add embedding provider to API context
  - Uses `createEmbeddingProvider()` from worker package
  - Makes embedding provider available via `app.embeddingProvider`

### Modified Files

- **`apps/api/src/index.ts`**
  - Registered `embeddingsPlugin` after auth plugin
  - Makes embedding provider available to all routes

- **`apps/api/src/modules/search/service.ts`**
  - Complete rewrite of `searchArticles()` function
  - Added helper functions for hybrid search
  - Enhanced `diversifyByStory()` function
  - Updated `getQueryEmbedding()` to use embedding provider

## Features Implemented

### 1. True Hybrid Search Union (4.1)

**Implementation:**
- Executes BM25 and k-NN queries separately in parallel
- Merges results by document ID with deduplication
- Normalizes scores from both query types (0-1 range)
- Applies representative scoring formula:
  ```
  score = 0.6 * bm25_norm + 0.3 * (1 + cosine_sim) + 0.1 * recency_decay
  ```
- Sorts by combined score

**Functions Created:**
- `executeBM25Query()` - Executes BM25 query with filters, returns top 200
- `executeKNNQuery()` - Executes k-NN query with filters, returns top 200
- `mergeSearchResults()` - Unions results, normalizes scores, deduplicates
- `applyRecencyBoost()` - Applies recency decay and computes combined score

**Query Flow:**
1. Build shared filters (date range, language, feedId)
2. Get query embedding (if query text provided)
3. Execute BM25 and k-NN queries in parallel
4. Merge and normalize scores
5. Apply recency boost
6. Sort by combined score
7. Apply story diversification if requested
8. Return top N results

### 2. Story Diversification (4.2)

**Implementation:**
- Groups results by `story_id`
- Sorts groups by max score within each group
- Selects top article per story until page size reached
- Includes `moreCount` field indicating additional articles in story

**Algorithm:**
1. Group all results by `story_id`
2. Sort articles within each group by combined score
3. Sort groups by max score (top article score)
4. Take top article from each group until page size reached
5. Set `moreCount = group.length - 1` for each selected article

**Function Enhanced:**
- `diversifyByStory()` - Now accepts scored results and page size, returns articles with `moreCount`

**Benefits:**
- Shows diverse stories in search results
- Prevents single story from dominating results
- Provides "view more" count for UI

### 3. Query Embedding Computation (4.3)

**Implementation:**
- Created Fastify plugin to add embedding provider to API context
- Updated `getQueryEmbedding()` to use `app.embeddingProvider`
- Integrated with both `searchArticles()` and `searchStories()`

**Plugin Details:**
- `embeddingsPlugin` - Fastify plugin that decorates app with `embeddingProvider`
- Uses same `createEmbeddingProvider()` function as worker
- Supports both mock and HTTP embedding providers

**Function Updated:**
- `getQueryEmbedding()` - Now uses `app.embeddingProvider.embed(query)` instead of direct HTTP call

**Benefits:**
- Consistent embedding provider across worker and API
- Centralized configuration via environment variables
- Better error handling and logging

## Score Normalization

**BM25 Scores:**
- Min-max normalization: `(score - min) / (max - min)`
- Handles edge case where all scores are equal (defaults to 0.5)

**k-NN Scores (Cosine Similarity):**
- Already in 0-1 range, but normalized for consistency
- Min-max normalization applied

**Recency Decay:**
- Exponential decay over 3 days
- Formula: `exp(-ageMs / threeDaysMs) * 0.5 + 0.5` for articles within 3 days
- Full boost (1.0) for future dates
- Reduced boost for older articles

## Combined Scoring

The final combined score uses the formula:
```
combinedScore = 0.6 * bm25Score + 0.3 * (1 + knnScore) + 0.1 * recencyDecay
```

**Weight Distribution:**
- 60% BM25 (keyword matching)
- 30% k-NN (semantic similarity, with +1 offset)
- 10% Recency (time-based boost)

This ensures:
- Keyword matches are prioritized
- Semantic similarity adds significant value
- Recent articles get a boost

## Performance Considerations

- **Parallel Queries**: BM25 and k-NN queries execute in parallel using `Promise.all()`
- **Result Size**: Both queries fetch top 200 results for union (configurable)
- **Deduplication**: Efficient Map-based deduplication by document ID
- **Score Normalization**: O(n) complexity for both query types
- **Story Diversification**: O(n log n) for sorting, O(n) for grouping

## Testing

**TypeScript Compilation:**
- ✅ All types compile without errors
- ✅ No linter errors

**Integration Points:**
- ✅ Embedding provider plugin registered correctly
- ✅ Search service uses embedding provider
- ✅ Story diversification works with new scoring
- ✅ Both `searchArticles()` and `searchStories()` updated

## Configuration

No new configuration required. Uses existing:
- `EMBEDDING_PROVIDER` - Provider type (mock/http)
- `EMBEDDING_ENDPOINT` - HTTP endpoint if using http provider

## Future Enhancements

Potential improvements:
- Make scoring weights configurable
- Add query-time boosting for specific fields
- Implement result caching for common queries
- Add metrics for hybrid search performance
- Support for multiple embedding providers
- A/B testing framework for scoring weights

## Migration Notes

**Breaking Changes:**
- None - all changes are backward compatible

**API Response Changes:**
- When `groupByStory=true`, articles now include optional `moreCount` field
- Search results are now sorted by combined score instead of individual query scores

**Performance Impact:**
- Slightly increased latency due to parallel queries and merging
- Improved result quality and diversity
- Better relevance for semantic queries

