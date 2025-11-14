# Phase 2 Runtime Testing Guide

## Prerequisites

1. **Elasticsearch Running:**
   ```bash
   # Check if ES is running
   curl http://localhost:9200
   
   # Or if using Docker:
   docker ps | grep elasticsearch
   ```

2. **Configuration:**
   - `SEARCH_ENABLED=true` in `.env`
   - `ELASTICSEARCH_NODE=http://localhost:9200` (or your ES URL)
   - Database with articles (preferably enriched with storyIds)

3. **Database:**
   - Articles should exist
   - Ideally some articles should have `storyId` assigned

## Quick Start

### Option 1: Run Automated Test Script

```bash
npm run test:runtime-story
```

This will:
- ✅ Check Elasticsearch connectivity
- ✅ Verify indices exist (create if needed)
- ✅ Find articles with storyIds
- ✅ Test story metadata computation
- ✅ Test story index updates
- ✅ Test story queue functionality
- ✅ Verify embeddings in ES

### Option 2: Manual Step-by-Step Testing

#### Step 1: Verify Elasticsearch

```bash
# Check ES health
curl http://localhost:9200/_cluster/health

# Check if indices exist
curl http://localhost:9200/_cat/indices | grep news
```

#### Step 2: Check Database

```bash
# Connect to database and check articles
psql $DATABASE_URL -c "SELECT COUNT(*) FROM articles WHERE story_id IS NOT NULL;"
```

#### Step 3: Start Worker

```bash
npm run dev --workspace @news-api/worker
```

**Watch for:**
- "Worker service bootstrap complete"
- No import errors
- Articles being enriched
- Story IDs being assigned

#### Step 4: Monitor Story Updates

**In worker logs, look for:**
```
[story-queue] Processing story updates
[story-maintenance] Computing story metadata
[story-maintenance] Updated story in index
```

**Timing:**
- Story updates happen after 5 minutes OR when 50 stories are queued
- You can force flush by calling `storyQueue.flush()` in code

#### Step 5: Verify in Elasticsearch

```bash
# Check stories index
curl http://localhost:9200/news-stories-v1/_search?size=10 | jq

# Get specific story
curl http://localhost:9200/news-stories-v1/_doc/STORY_ID | jq
```

**Expected fields:**
- `story_id`
- `title_rep`
- `summary`
- `keywords` (array)
- `sources` (array)
- `time_range_start`
- `time_range_end`
- `centroid_embedding` (array of 384 numbers)

## Testing Scenarios

### Scenario 1: Fresh Start (No StoryIds)

1. **Run backfill to assign storyIds:**
   ```bash
   npm run search:backfill -- --fromDays 1
   ```

2. **Verify storyIds assigned:**
   ```bash
   psql $DATABASE_URL -c "SELECT COUNT(*) FROM articles WHERE story_id IS NOT NULL;"
   ```

3. **Run runtime test:**
   ```bash
   npm run test:runtime-story
   ```

### Scenario 2: Existing StoryIds

1. **Check existing stories:**
   ```bash
   psql $DATABASE_URL -c "SELECT story_id, COUNT(*) FROM articles WHERE story_id IS NOT NULL GROUP BY story_id LIMIT 5;"
   ```

2. **Run runtime test:**
   ```bash
   npm run test:runtime-story
   ```

3. **Verify stories in ES:**
   ```bash
   curl http://localhost:9200/news-stories-v1/_search?size=5 | jq '.hits.hits[]._source'
   ```

### Scenario 3: Real-Time Updates

1. **Start worker:**
   ```bash
   npm run dev --workspace @news-api/worker
   ```

2. **Monitor logs for:**
   - Article enrichment
   - Story ID assignment
   - Story queue enqueue messages

3. **Wait 5 minutes or process 50 articles**

4. **Check ES for new/updated stories:**
   ```bash
   curl http://localhost:9200/news-stories-v1/_search?sort=@timestamp:desc&size=5 | jq
   ```

## Troubleshooting

### Issue: "Elasticsearch is down or unreachable"

**Solutions:**
1. Start Elasticsearch:
   ```bash
   # Docker
   docker run -d -p 9200:9200 -e "discovery.type=single-node" elasticsearch:8.15.0
   
   # Or use your ES setup
   ```

2. Check connection string in `.env`:
   ```
   ELASTICSEARCH_NODE=http://localhost:9200
   ```

3. Check firewall/network

### Issue: "No articles with storyIds found"

**Solutions:**
1. Run backfill:
   ```bash
   npm run search:backfill -- --fromDays 7
   ```

2. Let worker process articles:
   - Start worker
   - Wait for articles to be enriched
   - StoryIds will be assigned automatically

### Issue: "Story metadata computation returned null"

**Possible causes:**
- No articles found for storyId
- Articles don't have embeddings in ES
- ES connection issues

**Check:**
```bash
# Verify articles exist
psql $DATABASE_URL -c "SELECT COUNT(*) FROM articles WHERE story_id = 'STORY_ID';"

# Check embeddings
curl http://localhost:9200/news-articles-v1/_search -d '{
  "query": {"term": {"story_id": "STORY_ID"}},
  "_source": ["id", "title", "embedding"]
}' | jq '.hits.hits[] | {id: ._id, has_embedding: (._source.embedding != null)}'
```

### Issue: "Story document not found in index"

**Solutions:**
1. Refresh the index:
   ```bash
   curl -X POST http://localhost:9200/news-stories-v1/_refresh
   ```

2. Check if document exists:
   ```bash
   curl http://localhost:9200/news-stories-v1/_doc/STORY_ID
   ```

3. Check ES logs for errors

### Issue: "Story queue not processing"

**Check:**
1. Is search enabled? (`SEARCH_ENABLED=true`)
2. Is ES accessible?
3. Check worker logs for errors
4. Verify queue is being called:
   - Look for "Enqueued story for update" in logs
   - Or add debug logging

## Expected Output

### Successful Test Run:

```
✅ Elasticsearch Connection: Elasticsearch is accessible
✅ Elasticsearch Indices: Both indices exist
✅ Articles with Story IDs: Found 150 articles with storyIds
✅ Sample Story: Story abc-123 has 5 articles
✅ Article Embeddings: 5/5 articles have embeddings
✅ Story Metadata Computation: Story metadata computed successfully
✅ Story Index Update: Story updated in Elasticsearch
✅ Story Index Verification: Story document found in index
✅ Story Queue: Enqueued 3 stories for update
✅ Story Queue Flush: Queue flushed successfully

🎉 All tests passed!
```

### Worker Logs (Successful):

```
[worker] Worker service bootstrap complete
[enrich-articles] Article enrichment succeeded { articleId: '...', storyId: '...' }
[story-queue] Enqueued story for update { storyId: '...' }
[story-queue] Processing story updates { count: 50 }
[story-maintenance] Computing story metadata { storyId: '...' }
[story-maintenance] Updated story in index { storyId: '...' }
```

## Verification Checklist

- [ ] Elasticsearch is running and accessible
- [ ] Indices exist (articles and stories)
- [ ] Articles have storyIds assigned
- [ ] Articles have embeddings in ES
- [ ] Story metadata computation works
- [ ] Stories are updated in ES index
- [ ] Story queue processes updates
- [ ] Worker shutdown flushes queue

## Next Steps After Successful Testing

1. **Monitor in Production:**
   - Watch story queue processing
   - Monitor ES index growth
   - Check story metadata quality

2. **Performance Tuning:**
   - Adjust debounce period if needed
   - Tune batch size
   - Monitor ES write load

3. **Proceed to Phase 3:**
   - Implement Periodic Repair Job
   - Add cluster merge/split logic

