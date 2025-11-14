# PostgreSQL Stories Table Synchronization

## Overview

The story maintenance code has been updated to keep PostgreSQL and Elasticsearch in sync. Story records are now created and updated in both systems when story metadata is computed.

## Changes Made

### 1. Story Maintenance Functions Updated

**File: `apps/worker/src/lib/search/story-maintenance.ts`**

- **`updateStoryIndex()`**: Now accepts optional `db` parameter and upserts Story records to PostgreSQL
- **`batchUpdateStories()`**: Now accepts optional `db` parameter and batch upserts Story records to PostgreSQL
- **New function: `upsertStoryInPostgres()`**: Handles individual story upserts to PostgreSQL
- **New function: `batchUpsertStoriesInPostgres()`**: Handles batch story upserts using transactions

### 2. Story Queue Updated

**File: `apps/worker/src/lib/search/story-queue.ts`**

- Updated `flush()` method to pass `db` parameter to `batchUpdateStories()`

### 3. Reclustering Job Updated

**File: `apps/worker/src/jobs/recluster-stories.ts`**

- Updated `recomputeCentroids()` to pass `context.db` to `batchUpdateStories()`
- Updated `executeMerges()` to delete merged stories from PostgreSQL when clusters are merged

### 4. Backfill Script Updated

**File: `scripts/search-backfill.ts`**

- Updated to pass `prisma` database client to `batchUpdateStories()`

### 5. Test Scripts Updated

**Files:**
- `scripts/test-story-maintenance.ts`
- `scripts/test-runtime-story-maintenance.ts`

- Updated to pass `prisma` database client to `batchUpdateStories()`

## How It Works

### Story Creation/Update Flow

1. **Story Metadata Computation**: When `computeStoryMetadata()` is called, it:
   - Fetches all articles for a story from PostgreSQL
   - Retrieves embeddings from Elasticsearch
   - Computes story metadata (title, summary, keywords, time range, centroid)

2. **Dual Write**: When story metadata is updated:
   - **Elasticsearch**: Story document is indexed/updated in the `stories` index
   - **PostgreSQL**: Story record is upserted in the `stories` table

3. **Data Mapping**: Story data is mapped between formats:
   - `story_id` (ES) → `id` (PostgreSQL)
   - `title_rep` (ES) → `titleRep` (PostgreSQL)
   - `time_range_start` (ES) → `timeRangeStart` (PostgreSQL)
   - `time_range_end` (ES) → `timeRangeEnd` (PostgreSQL)
   - `keywords` (ES array) → `keywords` (PostgreSQL JSON)

### Story Deletion Flow

When stories are merged:
1. Articles are updated with the new `storyId`
2. Elasticsearch documents are updated
3. Old story is deleted from Elasticsearch `stories` index
4. Old story is deleted from PostgreSQL `stories` table

## Database Schema

The PostgreSQL `stories` table structure:

```sql
CREATE TABLE stories (
  id UUID PRIMARY KEY,
  title_rep TEXT,
  summary TEXT,
  keywords JSONB,
  time_range_start TIMESTAMPTZ,
  time_range_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Benefits

1. **Query Flexibility**: Can now query stories directly from PostgreSQL for analytics, joins, and reporting
2. **Data Consistency**: PostgreSQL and Elasticsearch stay in sync automatically
3. **Backup/Recovery**: Story data is persisted in PostgreSQL for backup and recovery
4. **SQL Queries**: Can use SQL to analyze stories, join with articles, and perform complex queries

## Usage

### Querying Stories from PostgreSQL

```typescript
import { prisma } from "@news-api/db";

// Get all stories
const stories = await prisma.story.findMany({
  include: {
    // Note: Currently no direct relation, but you can query articles by storyId
  }
});

// Get story with article count
const storyWithCount = await prisma.story.findUnique({
  where: { id: storyId },
  // Then query articles separately
});

const articleCount = await prisma.article.count({
  where: { storyId }
});
```

### Querying Stories from Elasticsearch

Stories are still available in Elasticsearch for search and clustering operations via the `/stories` API endpoint.

## Migration Notes

If you have existing stories in Elasticsearch but not in PostgreSQL:

1. **Option 1**: Run the backfill script to populate PostgreSQL:
   ```bash
   npm run search:backfill
   ```

2. **Option 2**: Stories will be automatically created in PostgreSQL when:
   - New stories are computed during article enrichment
   - Stories are updated during reclustering
   - Story metadata is recomputed

## Error Handling

- PostgreSQL upserts are wrapped in try-catch blocks
- If PostgreSQL write fails, the error is logged but doesn't stop Elasticsearch updates
- Story deletions from PostgreSQL gracefully handle "record not found" errors (P2025)

## Future Enhancements

Potential improvements:
- Add direct Prisma relation between `Story` and `Article` models
- Add indexes on `time_range_start` and `time_range_end` for time-based queries
- Add full-text search on `title_rep` and `summary` in PostgreSQL
- Add materialized views for story analytics

