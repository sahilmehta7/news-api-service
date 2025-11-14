# Phase 2 Testing Guide

## Quick Test Checklist

### 1. Compilation & Type Checking
```bash
# Check TypeScript compilation
npm run typecheck --workspace @news-api/worker

# Should complete without errors
```

### 2. Worker Startup Test
```bash
# Start worker (should not crash)
npm run dev --workspace @news-api/worker

# Expected: Worker starts successfully, no import errors
# Look for: "Worker service bootstrap complete"
```

### 3. Story Maintenance Test Script
```bash
# Run the test script
npm run test:story-maintenance

# This will:
# - Find stories with multiple articles
# - Compute story metadata
# - Update stories index
# - Test story queue
```

### 4. Integration Test (Manual)

#### Prerequisites:
- Elasticsearch running and accessible
- Database with articles that have `storyId` assigned
- `SEARCH_ENABLED=true` in `.env`

#### Steps:

1. **Verify stories index exists:**
   ```bash
   curl http://localhost:9200/news-stories-v1/_search?size=0
   ```

2. **Enrich an article** (via worker):
   - Worker should automatically:
     - Assign `storyId` to article
     - Queue story for update
     - After 5 minutes (or 50 stories), update stories index

3. **Check story in Elasticsearch:**
   ```bash
   # Replace STORY_ID with actual story ID
   curl http://localhost:9200/news-stories-v1/_doc/STORY_ID
   ```

4. **Verify story metadata:**
   - Should have: `title_rep`, `summary`, `keywords`, `sources`, `time_range_start/end`, `centroid_embedding`

### 5. Backfill Test

```bash
# Run backfill (will also update stories)
npm run search:backfill -- --fromDays 1

# Expected:
# - Articles indexed to ES
# - Story IDs assigned
# - Stories index updated at the end
```

## Expected Behavior

### During Article Enrichment:
1. Article gets enriched
2. `storyId` is assigned via clustering
3. Story is enqueued: `context.storyQueue.enqueue(storyId)`
4. Article is indexed to ES with `story_id` field

### Story Queue Processing:
1. Queue waits 5 minutes OR accumulates 50 stories
2. For each story:
   - Fetches all member articles from Postgres
   - Fetches embeddings from ES
   - Computes metadata
3. Batch updates stories to ES `stories` index

### On Worker Shutdown:
1. Story queue is flushed
2. All pending story updates are processed
3. Worker exits cleanly

## Troubleshooting

### Issue: "Cannot find package '@news-api/search'"
**Solution:** Run `npm install` to link workspace packages

### Issue: "Story metadata computation returns null"
**Possible causes:**
- No articles found for storyId
- Articles don't have embeddings in ES
- ES connection issues

**Check:**
```bash
# Verify articles exist
psql -c "SELECT COUNT(*) FROM articles WHERE story_id = 'STORY_ID';"

# Verify embeddings in ES
curl http://localhost:9200/news-articles-v1/_search -d '{
  "query": {"term": {"story_id": "STORY_ID"}},
  "_source": ["id", "title", "embedding"]
}'
```

### Issue: "Story queue not processing"
**Check:**
- Is search enabled? (`SEARCH_ENABLED=true`)
- Is ES accessible?
- Check worker logs for errors

### Issue: "Stories index not updating"
**Verify:**
1. Stories are being enqueued (check logs)
2. Queue is flushing (check logs for "Processing story updates")
3. ES write permissions
4. Index exists: `curl http://localhost:9200/news-stories-v1`

## Manual Verification

### Check Story Queue State:
Add temporary logging in `story-queue.ts`:
```typescript
logger.debug({ 
  pendingCount: this.pendingStoryIds.size,
  isProcessing: this.isProcessing 
}, "Queue state");
```

### Verify Story Document:
```bash
# Get story document
curl http://localhost:9200/news-stories-v1/_doc/STORY_ID | jq

# Expected fields:
# - story_id
# - title_rep
# - summary
# - keywords (array)
# - sources (array)
# - time_range_start
# - time_range_end
# - centroid_embedding (array of 384 numbers)
```

### Check Metrics:
```bash
# If metrics enabled
curl http://localhost:9090/metrics | grep search_cluster
```

## Success Criteria

✅ Worker starts without errors
✅ Articles get `storyId` assigned during enrichment
✅ Stories are enqueued after `storyId` assignment
✅ Story queue processes updates (check logs after 5 min or 50 stories)
✅ Stories index contains documents with all required fields
✅ **PostgreSQL `stories` table contains synchronized story records**
✅ Worker shutdown flushes story queue cleanly
✅ Backfill script updates stories index and PostgreSQL

## Next Steps After Testing

If all tests pass:
1. Monitor story queue processing in production
2. Verify story metadata quality
3. Proceed to Phase 3 (Periodic Repair Job)

If issues found:
1. Check logs for specific errors
2. Verify ES connectivity and permissions
3. Ensure articles have embeddings in ES
4. Review story metadata computation logic

