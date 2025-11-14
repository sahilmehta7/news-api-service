# Phase 2 Implementation Summary: Stories Index Maintenance

## ✅ Completed Implementation

### 1. Story Metadata Computation (`apps/worker/src/lib/search/story-maintenance.ts`)

**Functions Created:**
- `computeStoryMetadata()` - Main function to compute all story metadata from member articles
- `fetchEmbeddings()` - Fetches article embeddings from Elasticsearch in batches
- `computeTitleRep()` - Selects medoid article (closest to centroid) as representative title
- `computeSummary()` - Extracts lead-3 sentences from most recent article
- `computeKeywords()` - Union of all keywords, top 10 by frequency
- `computeSources()` - Unique source origins from member articles
- `computeTimeRange()` - Min/max published dates from members
- `computeCentroid()` - Mean of all member article embeddings

**Features:**
- Handles articles without embeddings gracefully
- Batches ES queries for efficiency (100 articles per batch)
- Computes all required metadata fields for `StoryDocument`

### 2. Story Index Updates (`apps/worker/src/lib/search/story-maintenance.ts`)

**Functions Created:**
- `updateStoryIndex()` - Updates single story document in ES
- `batchUpdateStories()` - Bulk updates multiple stories efficiently

**Features:**
- Uses ES bulk API for performance
- Tracks metrics via `searchClusterDuration`
- Error handling and logging

### 3. Story Update Queue (`apps/worker/src/lib/search/story-queue.ts`)

**Class Created:**
- `StoryUpdateQueue` - Debounces and batches story updates

**Features:**
- **Debouncing**: 5-minute delay before processing updates
- **Batching**: Processes up to 50 stories at once
- **Auto-flush**: Flushes immediately when batch size reached
- **Graceful shutdown**: `close()` method flushes pending updates
- **Error recovery**: Re-queues failed story IDs

**Configuration:**
- `UPDATE_DEBOUNCE_MS = 5 * 60 * 1000` (5 minutes)
- `BATCH_SIZE = 50` stories

### 4. PostgreSQL Story Synchronization

**Functions Created:**
- `upsertStoryInPostgres()` - Upserts single story record to PostgreSQL
- `batchUpsertStoriesInPostgres()` - Batch upserts multiple stories using transactions

**Features:**
- Creates `Story` records when stories are first computed
- Updates `Story` records when story metadata changes
- Keeps PostgreSQL and Elasticsearch `stories` index in sync
- Uses `Prisma.JsonNull` for empty keywords arrays

**Integration:**
- `updateStoryIndex()` and `batchUpdateStories()` now accept optional `db` parameter
- All story update paths now sync to PostgreSQL:
  - Story queue processing
  - Reclustering job
  - Backfill script
  - Test scripts

### 5. Integration Points

**Worker Context (`apps/worker/src/context.ts`):**
- ✅ Added `storyQueue: StoryUpdateQueue` to `WorkerContext`
- ✅ Initialized story queue in `createWorkerContext()`

**Enrichment Flow (`apps/worker/src/jobs/enrich-articles.ts`):**
- ✅ After `storyId` assignment, enqueues story for update
- ✅ Triggers story metadata recomputation when new article joins story

**Worker Shutdown (`apps/worker/src/index.ts`):**
- ✅ Flushes story queue on shutdown
- ✅ Ensures all pending story updates are processed

**Reclustering Job (`apps/worker/src/jobs/recluster-stories.ts`):**
- ✅ Updates PostgreSQL when centroids are recomputed
- ✅ Deletes merged stories from PostgreSQL during cluster merges

## How It Works

1. **Article Enrichment**:
   - Article is enriched and assigned a `storyId`
   - Story update is queued via `context.storyQueue.enqueue(storyId)`

2. **Debounced Processing**:
   - Queue waits 5 minutes (or until 50 stories accumulated)
   - Prevents excessive ES writes during high-volume periods

3. **Metadata Computation**:
   - For each queued story:
     - Fetches all member articles from Postgres
     - Fetches embeddings from Elasticsearch
     - Computes metadata (title, summary, keywords, sources, time range, centroid)

4. **Index Update**:
   - Batch updates all stories to Elasticsearch `stories` index
   - Uses story_id as document ID for upsert behavior

## Benefits

1. **Performance**: Debouncing reduces ES write load
2. **Efficiency**: Batching minimizes network round-trips
3. **Reliability**: Error recovery and graceful shutdown
4. **Accuracy**: Story metadata reflects current member articles

## Next Steps (Phase 3) ✅ COMPLETE

Phase 3 has been implemented:
- ✅ Periodic repair job to recluster and recompute centroids
- ✅ Cluster merge/split logic
- ✅ Centroid recomputation for existing stories
- ✅ Story re-evaluation

## Recent Fixes

- Fixed TypeScript type safety issues in story maintenance
- Fixed Prisma `keywords` field handling (`Prisma.JsonNull`)
- Improved error handling for missing Elasticsearch documents
- Fixed import paths for `StoryDocument` type

## Testing Recommendations

1. **Unit Tests**: Test metadata computation functions with sample data
2. **Integration Tests**: Verify story updates appear in ES after enrichment
3. **Load Tests**: Ensure queue handles high-volume scenarios
4. **Manual Verification**: Check stories index after processing articles

## Configuration

No new configuration required. The story queue uses existing search configuration:
- `SEARCH_ENABLED` - Controls whether story updates run
- `ELASTICSEARCH_NODE` - ES connection for story index updates

## Metrics

Story updates are tracked via existing metrics:
- `news_search_cluster_duration_seconds` - Time to update stories

