# Phase 3: Periodic Repair Job - Implementation Summary

## Overview

Phase 3 implements a periodic reclustering job that runs every 15-30 minutes to maintain story cluster quality. This job performs four key operations:

1. **Centroid Recomputation**: Updates story centroids based on current member articles
2. **Cluster Merging**: Merges overlapping clusters with high similarity
3. **Cluster Splitting**: Splits low-cohesion clusters using k-means
4. **Story Re-evaluation**: Re-assigns articles to better stories in the sliding window

## Files Created/Modified

### New Files

- **`apps/worker/src/jobs/recluster-stories.ts`** (706 lines)
  - Main reclustering job implementation
  - Scheduler function `startReclusteringScheduler`
  - Cluster maintenance functions (merge, split, recompute)

### Modified Files

- **`packages/config/src/schema.ts`**
  - Added `clustering` configuration schema with:
    - `enabled`: Enable/disable clustering (default: true)
    - `reclusterIntervalMs`: Interval between runs (default: 20 minutes)
    - `windowHours`: Sliding window size (default: 72 hours)
    - `mergeSimilarityThreshold`: Threshold for merging (default: 0.85)
    - `splitCohesionThreshold`: Threshold for splitting (default: 0.75)
    - `minClusterSizeForSplit`: Minimum size to consider splitting (default: 5)

- **`packages/config/src/load-config.ts`**
  - Added environment variable loading for clustering config:
    - `CLUSTERING_ENABLED`
    - `CLUSTERING_RECLUSTER_INTERVAL_MS`
    - `CLUSTERING_WINDOW_HOURS`
    - `CLUSTERING_MERGE_SIMILARITY_THRESHOLD`
    - `CLUSTERING_SPLIT_COHESION_THRESHOLD`
    - `CLUSTERING_MIN_CLUSTER_SIZE_FOR_SPLIT`

- **`apps/worker/src/index.ts`**
  - Integrated `startReclusteringScheduler` into worker startup
  - Added scheduler stop to shutdown sequence

- **`apps/worker/src/lib/search/clustering.ts`**
  - Exported `cosineSimilarity` function for use in reclustering

## Features Implemented

### 1. Reclustering Scheduler

The scheduler runs periodically (default: every 20 minutes) and processes articles in a sliding time window (default: 72 hours).

**Configuration:**
- `CLUSTERING_ENABLED=true` (default)
- `CLUSTERING_RECLUSTER_INTERVAL_MS=1200000` (20 minutes)
- `CLUSTERING_WINDOW_HOURS=72`

### 2. Centroid Recomputation

For each story with articles in the window:
- Fetches all member articles from database
- Retrieves embeddings from Elasticsearch
- Computes new centroid as mean of all embeddings
- Updates story document in Elasticsearch `stories` index
- Updates time ranges, keywords, and other metadata

### 3. Cluster Merging

Detects and merges overlapping clusters:
- Compares centroid similarity between all story pairs
- If similarity ≥ `mergeSimilarityThreshold` (default: 0.85):
  - Checks time range overlap (within 24 hours)
  - Merges into single story (keeps earlier storyId)
  - Updates all articles in merged story
  - Deletes old story from `stories` index
  - Queues update for merged story

### 4. Cluster Splitting

Splits low-cohesion clusters:
- For each story with size ≥ `minClusterSizeForSplit` (default: 5):
  - Computes cohesion (mean cosine similarity to centroid)
  - If cohesion < `splitCohesionThreshold` (default: 0.75):
    - Runs k-means with k=2
    - Splits into two stories
    - Reassigns articles to nearest centroid
    - Creates new story document
    - Updates all affected articles

### 5. Story Re-evaluation

Re-evaluates story assignments for articles in window:
- Fetches articles from database (status: enriched)
- Retrieves embeddings from Elasticsearch
- Re-runs clustering algorithm to find best story
- Updates article `storyId` if changed
- Updates Elasticsearch documents
- Queues story updates for affected stories

## Algorithm Details

### K-Means Splitting

When splitting a cluster:
1. Initialize centroids using farthest point sampling
2. Iterate 10 times:
   - Assign articles to nearest centroid
   - Recompute centroids from assigned groups
3. Final assignment based on nearest centroid
4. Create new story for second group
5. Update all articles and story documents

### Time Range Overlap Check

For merging, checks if two stories have articles within 24 hours of each other:
- Fetches earliest article from each story
- Computes time difference
- Returns true if difference < 24 hours

## Metrics

The reclustering job uses existing metrics:
- `news_search_cluster_duration_seconds`: Duration of clustering operations
- `news_search_clusters_total{action="merge"}`: Number of merges
- `news_search_clusters_total{action="split"}`: Number of splits

## Integration

The reclustering scheduler:
- Starts automatically when worker boots (if clustering enabled)
- Runs independently of ingestion/enrichment
- Respects `CLUSTERING_ENABLED` flag
- Gracefully handles Elasticsearch unavailability
- Logs all operations for monitoring

## Configuration Example

```env
# Enable clustering
CLUSTERING_ENABLED=true

# Run every 20 minutes
CLUSTERING_RECLUSTER_INTERVAL_MS=1200000

# Process articles from last 72 hours
CLUSTERING_WINDOW_HOURS=72

# Merge clusters with similarity >= 0.85
CLUSTERING_MERGE_SIMILARITY_THRESHOLD=0.85

# Split clusters with cohesion < 0.75
CLUSTERING_SPLIT_COHESION_THRESHOLD=0.75

# Only split clusters with at least 5 articles
CLUSTERING_MIN_CLUSTER_SIZE_FOR_SPLIT=5
```

## Testing

To test the reclustering job:

1. **Enable search and clustering:**
   ```bash
   SEARCH_ENABLED=true
   CLUSTERING_ENABLED=true
   ```

2. **Start Elasticsearch:**
   ```bash
   docker run -d -p 9200:9200 -e 'discovery.type=single-node' elasticsearch:8.15.0
   ```

3. **Run worker:**
   ```bash
   npm run dev
   ```

4. **Monitor logs:**
   - Look for "Reclustering scheduler started" message
   - Check for "Starting periodic reclustering job" every 20 minutes
   - Verify merge/split operations in logs

5. **Check metrics:**
   ```bash
   curl http://localhost:9300/metrics | grep search_cluster
   ```

## Performance Considerations

- Processes articles in batches (1000 at a time for re-evaluation)
- Limits embedding fetches to 100 per story (for performance)
- Uses debounced story updates via `StoryUpdateQueue`
- Skips processing if search is disabled
- Handles errors gracefully without stopping scheduler
- **Gracefully skips articles not in Elasticsearch** (404 errors are expected for articles enriched before search was enabled)

## PostgreSQL Synchronization

The reclustering job now also maintains PostgreSQL `stories` table:
- Updates story records when centroids are recomputed
- Deletes merged stories from PostgreSQL during cluster merges
- Keeps PostgreSQL and Elasticsearch in sync

## Recent Fixes

- Fixed error handling for articles not in Elasticsearch (404 errors)
- Fixed TypeScript type safety issues
- Improved null handling for embeddings and centroids
- Fixed Prisma `keywords` field to use `Prisma.JsonNull` instead of `null`

## Future Enhancements

Potential improvements:
- Incremental processing (only process changed stories)
- Parallel processing of multiple stories
- More sophisticated k-means initialization
- Graph-based clustering for better merge detection
- Configurable batch sizes
- Metrics for merge/split success rates

