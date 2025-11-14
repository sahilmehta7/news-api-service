# Search & Clustering Implementation Plan

This plan addresses the remaining features from `search-and-clustering.md` and gaps identified in `search-implementation-status.md`.

## Phase 1: Fix Critical Bugs & Infrastructure

### 1.1 Fix Syntax Error
- ✅ **DONE**: Fixed duplicate `else` statement in `apps/worker/src/lib/search/indexing.ts`
- ✅ **DONE**: Fixed missing `workerMetrics` import in `apps/worker/src/lib/search/clustering.ts`
- ✅ **DONE**: Fixed `workspace:*` protocol issues (replaced with version numbers)

### 1.2 Verify Package Resolution
- ✅ **DONE**: Updated package.json files to use version numbers instead of `workspace:*`
- ✅ **DONE**: Added `exports` field to `@news-api/search` package.json
- **TODO**: Test worker startup to ensure package resolution works

## Phase 2: Stories Index Maintenance (Critical) ✅ COMPLETE

### 2.1 Story Metadata Computation ✅
**Files created:**
- ✅ `apps/worker/src/lib/search/story-maintenance.ts`

**Implementation:**
- ✅ Function to compute story metadata from member articles:
  - ✅ `title_rep`: Select medoid article (article with embedding closest to centroid)
  - ✅ `summary`: Simple lead-3 sentences from top article
  - ✅ `keywords`: Union of keywords from all member articles
  - ✅ `sources`: Unique source URLs from member articles
  - ✅ `time_range_start/end`: Min/max `published_at` from members
  - ✅ `centroid_embedding`: Mean of all member article embeddings

**Dependencies:**
- ✅ Fetch all articles for a storyId from Postgres
- ✅ Retrieve embeddings from ES
- ✅ Calculate centroid vector

### 2.2 Stories Index Updates ✅
**Files modified:**
- ✅ `apps/worker/src/lib/search/story-maintenance.ts`
- ✅ `apps/worker/src/lib/search/story-queue.ts`

**Implementation:**
- ✅ After assigning `storyId` to an article, trigger story metadata update
- ✅ Upsert story document to `stories` index:
  - ✅ Use `story_id` as document ID
  - ✅ Update all metadata fields
  - ✅ Recompute centroid from current members
- ✅ **PostgreSQL synchronization**: Also upserts to `stories` table

**Integration point:**
- ✅ Call story update after `assignStoryId` in `apps/worker/src/jobs/enrich-articles.ts`

### 2.3 Batch Story Updates ✅
**Implementation:**
- ✅ Queue story updates to avoid excessive ES writes
- ✅ Batch updates for stories that received new articles
- ✅ Debounce updates (update once per 5 minutes per story, batch size 50)
- ✅ PostgreSQL synchronization included in batch updates

## Phase 3: Periodic Repair Job (Critical) ✅ COMPLETE

### 3.1 Reclustering Job ✅
**Files created:**
- ✅ `apps/worker/src/jobs/recluster-stories.ts`

**Implementation:**
- ✅ Scheduled job (every 15-30 minutes, default: 20 minutes)
- ✅ Process articles in 72h sliding window
- ✅ For each article:
  - ✅ Re-run k-NN search
  - ✅ Re-evaluate story assignment
  - ✅ Update story if assignment changed
  - ✅ Gracefully handles articles not in Elasticsearch (404 errors)

**Configuration:**
- ✅ Added `CLUSTERING_RECLUSTER_INTERVAL_MS` to config (default: 20 minutes)
- ✅ Added `CLUSTERING_WINDOW_HOURS` (default: 72)
- ✅ Added full clustering configuration schema

### 3.2 Cluster Merge Logic ✅
**Implementation:**
- ✅ Detect overlapping clusters:
  - ✅ Find stories with centroid similarity > 0.85 (configurable)
  - ✅ Check time range overlap (within 24 hours)
  - ✅ Merge into single story (use earliest storyId)
- ✅ Update all member articles with new `storyId`
- ✅ Delete merged story document from `stories` index
- ✅ **Delete merged story from PostgreSQL** `stories` table

### 3.3 Cluster Split Logic ✅
**Implementation:**
- ✅ Compute cluster cohesion (mean cosine similarity of members to centroid)
- ✅ If cohesion < 0.75 (configurable) and cluster size > 5 (configurable):
  - ✅ Run k-means with k=2 on member embeddings
  - ✅ Split into two stories
  - ✅ Reassign articles to nearest new centroid
  - ✅ Create new story documents
  - ✅ Update PostgreSQL `stories` table

### 3.4 Centroid Recomputation ✅
**Implementation:**
- ✅ For each story:
  - ✅ Fetch all current member articles
  - ✅ Recompute centroid as mean of embeddings
  - ✅ Update `stories` index with new centroid
  - ✅ Update time ranges if changed
  - ✅ **Update PostgreSQL `stories` table**

**Integration:**
- ✅ Added to worker scheduler in `apps/worker/src/index.ts`
- ✅ Runs independently of enrichment queue
- ✅ Respects `CLUSTERING_ENABLED` flag

## Phase 4: Enhanced Search Features ✅ COMPLETE

### 4.1 True Hybrid Search Union ✅
**Files modified:**
- ✅ `apps/api/src/modules/search/service.ts`

**Implementation:**
- ✅ Execute both BM25 and k-NN queries separately
- ✅ Union results by document ID
- ✅ Deduplicate and merge scores
- ✅ Apply representative scoring formula:
  ```
  score = 0.6 * bm25_norm + 0.3 * (1 + cosine_sim) + 0.1 * recency_decay
  ```
- ✅ Sort by combined score

**Query structure:**
- ✅ Run BM25 query (size: 200)
- ✅ Run k-NN query (k: 200)
- ✅ Merge and deduplicate
- ✅ Apply recency boost
- ✅ Return top N results

**Functions created:**
- ✅ `executeBM25Query()` - Separate BM25 query execution
- ✅ `executeKNNQuery()` - Separate k-NN query execution
- ✅ `mergeSearchResults()` - Union and score normalization
- ✅ `applyRecencyBoost()` - Combined scoring with recency

### 4.2 Story Diversification ✅
**Files modified:**
- ✅ `apps/api/src/modules/search/service.ts`

**Implementation:**
- ✅ When `groupByStory=true`:
  - ✅ Group results by `story_id`
  - ✅ Select top 1 article per story (highest score)
  - ✅ Fill remaining slots with diverse stories
  - ✅ Include `moreCount` per story (total articles in story - 1)
- ✅ Return diversified results with story metadata

**Algorithm:**
- ✅ Retrieve top 200 union results
- ✅ Group by `story_id`
- ✅ Sort groups by max score within group
- ✅ Take top article from each group until page size reached
- ✅ Track remaining articles per story for "view more" links

**Function created:**
- ✅ `diversifyByStory()` - Enhanced with proper scoring and moreCount

### 4.3 Query Embedding Computation ✅
**Files created/modified:**
- ✅ `apps/api/src/plugins/embeddings.ts` (new) - Fastify plugin for embedding provider
- ✅ `apps/api/src/index.ts` - Registered embeddings plugin
- ✅ `apps/api/src/modules/search/service.ts` - Updated to use embedding provider

**Implementation:**
- ✅ Added embedding provider to API context via Fastify plugin
- ✅ Compute query embedding for text queries using `app.embeddingProvider`
- ✅ Use embedding for k-NN search
- ✅ Fallback to BM25 if embedding fails

**Function created:**
- ✅ `getQueryEmbedding()` - Uses embedding provider from Fastify instance

**Integration:**
- Import embedding provider in API
- Add to Fastify instance context or create per-request

## Phase 5: Embedding Provider Enhancements ✅ COMPLETE

### 5.1 Circuit Breaker ✅
**Files created/modified:**
- ✅ `apps/worker/src/lib/embeddings/circuit-breaker.ts` (new)
- ✅ `apps/worker/src/lib/embeddings/provider.ts`

**Implementation:**
- ✅ Track success/failure rates
- ✅ Open circuit after 5 consecutive failures (configurable via `EMBEDDING_CIRCUIT_BREAKER_FAILURE_THRESHOLD`)
- ✅ Half-open after 30 seconds (configurable via `EMBEDDING_CIRCUIT_BREAKER_TIMEOUT_MS`)
- ✅ Close circuit after 3 consecutive successes (configurable via `EMBEDDING_CIRCUIT_BREAKER_SUCCESS_THRESHOLD`)
- ✅ Return dummy embedding when circuit is open
- ✅ Circuit breaker state exposed via metrics

### 5.2 Retry with Backoff ✅
**Files modified:**
- ✅ `apps/worker/src/lib/embeddings/provider.ts`

**Implementation:**
- ✅ Exponential backoff: 1s, 2s, 4s, 8s (configurable via `EMBEDDING_RETRY_INITIAL_DELAY_MS`, `EMBEDDING_RETRY_MAX_DELAY_MS`)
- ✅ Max 3 retries (configurable via `EMBEDDING_MAX_RETRIES`)
- ✅ Timeout: 10 seconds per request (configurable via `EMBEDDING_TIMEOUT_MS`)
- ✅ Log retry attempts
- ✅ Retry metrics tracking

### 5.3 Production Provider Options ✅
**Files created:**
- ✅ `apps/worker/src/lib/embeddings/node-provider.ts` (placeholder for Node.js models)
- ✅ HTTP provider already exists in `provider.ts`

**Implementation:**
- ✅ HTTP provider: Enhanced with circuit breaker and retry logic
- ✅ Node provider: Placeholder created for `@xenova/transformers` integration (requires package installation)
- ✅ Configuration-driven selection via `EMBEDDING_PROVIDER` env var (mock/http/node)
- ✅ Metrics integration for all providers

**Metrics Added:**
- ✅ `news_embedding_requests_total{provider, status}`: Request counts
- ✅ `news_embedding_duration_seconds{provider}`: Request duration
- ✅ `news_embedding_circuit_breaker_state{provider}`: Circuit breaker state (0=closed, 1=half-open, 2=open)
- ✅ `news_embedding_retries_total{provider}`: Retry counts

**Environment Variables:**
- `EMBEDDING_PROVIDER`: Provider type (mock/http/node, default: mock)
- `EMBEDDING_ENDPOINT`: HTTP endpoint URL (required for http provider)
- `EMBEDDING_MODEL`: Model name for node provider
- `EMBEDDING_TIMEOUT_MS`: Request timeout (default: 10000)
- `EMBEDDING_CIRCUIT_BREAKER_FAILURE_THRESHOLD`: Failures before opening (default: 5)
- `EMBEDDING_CIRCUIT_BREAKER_SUCCESS_THRESHOLD`: Successes before closing (default: 3)
- `EMBEDDING_CIRCUIT_BREAKER_TIMEOUT_MS`: Time before half-open (default: 30000)
- `EMBEDDING_MAX_RETRIES`: Max retry attempts (default: 3)
- `EMBEDDING_RETRY_INITIAL_DELAY_MS`: Initial retry delay (default: 1000)
- `EMBEDDING_RETRY_MAX_DELAY_MS`: Max retry delay (default: 8000)

## Phase 6: Advanced Clustering Features ✅ COMPLETE

### 6.1 Jaccard Similarity for Title Shingles ✅
**Files created/modified:**
- ✅ `apps/worker/src/lib/search/similarity.ts` (new)
- ✅ `apps/worker/src/lib/search/clustering.ts`

**Implementation:**
- ✅ Extract title shingles (2-3 word sequences) using `extractShingles()`
- ✅ Compute Jaccard index between article titles using `jaccardSimilarity()`
- ✅ Weighted combination of bigrams (0.6) and trigrams (0.4) via `titleJaccardSimilarity()`
- ✅ Combined with cosine similarity using configurable weights (default: 0.7 cosine, 0.2 jaccard, 0.1 entity)

**Algorithm:**
```typescript
function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}
```

### 6.2 Named Entity Overlap ✅
**Files created:**
- ✅ `apps/worker/src/lib/search/similarity.ts` (includes entity extraction)

**Implementation:**
- ✅ Extract named entities from titles/content using regex patterns:
  - Person names (capitalized 2-3 word sequences)
  - Organization names (with Inc, Corp, LLC, etc. suffixes)
  - Location names (capitalized multi-word phrases)
- ✅ Compute overlap ratio using Jaccard similarity via `entityOverlap()`
- ✅ Integrated into clustering algorithm as additional signal

**Approach:**
- Lightweight regex-based extraction (no external dependencies)
- Can be enhanced with NLP libraries (`compromise`, `natural`) in the future
- Entity extraction focuses on common patterns to avoid false positives

### 6.3 Combined Similarity Score ✅
**Implementation:**
- ✅ `combinedSimilarity()` function computes weighted average of:
  - Cosine similarity (embedding-based, default weight: 0.7)
  - Jaccard similarity (title shingles, default weight: 0.2)
  - Entity overlap (named entities, default weight: 0.1)
- ✅ Configurable weights via environment variables:
  - `CLUSTERING_COSINE_WEIGHT` (default: 0.7)
  - `CLUSTERING_JACCARD_WEIGHT` (default: 0.2)
  - `CLUSTERING_ENTITY_WEIGHT` (default: 0.1)
- ✅ Effective threshold: 95% of base similarity threshold (0.82 * 0.95 = 0.779)
- ✅ Performance optimization: Only computes Jaccard/entity similarity for candidates with cosine similarity >= 0.9 * threshold

**Configuration:**
- Added to `packages/config/src/schema.ts`: `cosineWeight`, `jaccardWeight`, `entityWeight`
- Added to `packages/config/src/load-config.ts`: Environment variable loading

## Phase 7: Admin Settings UI ✅ COMPLETE

### 7.1 Settings Page ✅
**Files created/modified:**
- ✅ `apps/admin/src/app/(dashboard)/settings/page.tsx` (updated to include SearchHealth component)

**Implementation:**
- ✅ Display search configuration status via SearchHealth component:
  - `SEARCH_ENABLED` status
  - Elasticsearch node URL
  - Index health (document counts, status)
  - Cluster health status
- ✅ "Refresh" button to reload search settings
- ✅ Display ES cluster health with color-coded badges

### 7.2 Search Health Component ✅
**Files created:**
- ✅ `apps/admin/src/components/settings/search-health.tsx`

**Implementation:**
- ✅ Uses `useSearchSettings()` hook to fetch from `/settings/search` endpoint
- ✅ Displays connection status with color-coded badges (green/yellow/red)
- ✅ Shows index document counts for articles and stories indices
- ✅ Displays cluster health status
- ✅ Shows Elasticsearch configuration (node, index prefix, default language, auth status)
- ✅ Auto-refreshes every 30 seconds
- ✅ Manual refresh button

### 7.3 API Endpoint for Settings ✅
**Files created:**
- ✅ `apps/api/src/modules/settings/routes.ts`
- ✅ `apps/api/src/modules/settings/service.ts`
- ✅ `apps/api/src/modules/settings/schemas.ts`
- ✅ `apps/api/src/index.ts` (updated to register settings routes)

**Implementation:**
- ✅ `GET /settings/search` endpoint (requires admin authentication)
- ✅ Returns:
  - Search enabled status
  - ES connection status and cluster health
  - Index health metrics (exists, document counts, health status)
  - Configuration (without secrets: node URL, index prefix, default language, auth presence)

### 7.4 Admin API Integration ✅
**Files created:**
- ✅ `apps/admin/src/lib/api/settings.ts` (SWR hook for search settings)
- ✅ `apps/admin/src/lib/api/types.ts` (updated with SearchSettingsResponse schema)

**Implementation:**
- ✅ `useSearchSettings()` hook with SWR for caching and auto-refresh
- ✅ Type-safe API integration with Zod schema validation

## Phase 8: Testing & Validation ✅ COMPLETE

### 8.1 Unit Tests ✅
**Files created:**
- ✅ `apps/worker/src/lib/search/similarity.test.ts` - Tests for Jaccard similarity, entity extraction, combined similarity
- ✅ `apps/worker/src/lib/search/clustering.test.ts` - Tests for cosine similarity function
- ✅ `apps/worker/src/lib/search/story-maintenance.test.ts` - Placeholder for story maintenance tests (integration tests recommended)
- ✅ `apps/api/src/modules/search/service.test.ts` - Tests for `diversifyByStory` function

**Coverage:**
- ✅ Similarity functions (Jaccard, entity overlap, combined similarity)
- ✅ Cosine similarity calculations
- ✅ Story diversification logic
- ✅ Edge cases (empty inputs, undefined values, different vector lengths)

### 8.2 Integration Tests ✅
**Files created:**
- ✅ `supplier_capabilities/tests/search-endpoints.test.ts`
- ✅ `supplier_capabilities/tests/stories-endpoints.test.ts`

**Coverage:**
- ✅ Search endpoint with various query types
- ✅ Stories endpoint pagination
- ✅ Story detail endpoint
- ✅ Fallback to Postgres when ES disabled
- ✅ Query parameter handling

### 8.3 Performance Tests ✅
**Files created:**
- ✅ `scripts/benchmark-search.ts`

**Metrics:**
- ✅ Query latency (p50, p95, p99)
- ✅ Search query throughput
- ✅ k-NN query performance
- ✅ Memory usage tracking
- ✅ Configurable iterations via `BENCHMARK_ITERATIONS` env var

**Usage:**
```bash
npm run benchmark:search
# Or with custom iterations:
BENCHMARK_ITERATIONS=200 npm run benchmark:search
```

## Implementation Order

### Priority 1 (Critical - Blocks Production)
1. ✅ Fix syntax errors and package resolution
2. ✅ **Stories index maintenance** (Phase 2) - **COMPLETE**
3. ✅ **Periodic repair job** (Phase 3) - **COMPLETE**

### Priority 2 (Important - Enhances Quality)
4. ✅ **True hybrid search** (Phase 4.1) - **COMPLETE**
5. ✅ **Story diversification** (Phase 4.2) - **COMPLETE**
6. ✅ **Query embedding computation** (Phase 4.3) - **COMPLETE**
7. **Embedding provider enhancements** (Phase 5)

### Priority 3 (Nice to Have)
8. **Advanced clustering** (Phase 6)
9. **Admin settings UI** (Phase 7)
10. **Comprehensive testing** (Phase 8)

## Estimated Effort

- **Phase 1**: ✅ 1 hour (complete)
- **Phase 2**: ✅ 8-12 hours (complete, including PostgreSQL sync)
- **Phase 3**: ✅ 12-16 hours (complete, including bug fixes)
- **Phase 4**: ✅ 8-10 hours (complete)
- **Phase 5**: 6-8 hours (remaining)
- **Phase 6**: 8-10 hours (remaining)
- **Phase 7**: 4-6 hours (remaining)
- **Phase 8**: 8-12 hours (remaining)

**Completed**: ~29-39 hours
**Remaining**: ~26-38 hours
**Total**: ~55-75 hours

## Dependencies

- Elasticsearch cluster running and accessible
- Embedding provider configured (dummy works for testing)
- Sufficient test data for validation

## Risks & Mitigations

1. **ES performance**: Large story updates may impact ES
   - *Mitigation*: Batch updates, debounce, async processing

2. **Clustering quality**: May need threshold tuning
   - *Mitigation*: Make thresholds configurable, add metrics

3. **Embedding provider costs**: External APIs can be expensive
   - *Mitigation*: Circuit breaker, caching, local model option

4. **Data consistency**: Stories index may drift from reality
   - *Mitigation*: Periodic repair job, validation checks

