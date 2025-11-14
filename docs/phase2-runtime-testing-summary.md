# Phase 2 Runtime Testing - Ready to Execute

## ✅ Testing Tools Created

### 1. Quick Verification Script
**Command:** `npm run verify:story-setup`

**Purpose:** Quick check of prerequisites
- ✅ Verifies search configuration
- ✅ Checks Elasticsearch connectivity  
- ✅ Checks database for articles with storyIds
- ✅ Verifies implementation files exist

**Use this first** to ensure your environment is ready.

### 2. Comprehensive Runtime Test
**Command:** `npm run test:runtime-story`

**Purpose:** Full end-to-end testing
- ✅ Tests Elasticsearch connection
- ✅ Verifies indices exist (creates if needed)
- ✅ Finds articles with storyIds
- ✅ Tests story metadata computation
- ✅ Tests story index updates
- ✅ Tests story queue functionality
- ✅ Verifies embeddings in ES

**Use this** after verification passes.

### 3. Manual Test Script
**Command:** `npm run test:story-maintenance`

**Purpose:** Interactive testing with detailed output
- Tests story metadata computation
- Tests story queue
- Provides helpful error messages

## 🚀 Quick Start Testing

### Step 1: Verify Setup
```bash
npm run verify:story-setup
```

**Expected output:**
```
🔍 Verifying Story Maintenance Setup...

1. Checking search configuration...
   ✅ SEARCH_ENABLED=true

2. Checking Elasticsearch connection...
   ✅ Elasticsearch is accessible

3. Checking database...
   📊 Total articles: 1000
   📊 Articles with storyIds: 500
   ✅ Articles with storyIds found
   📊 Stories with multiple articles: 50

4. Checking implementation files...
   ✅ apps/worker/src/lib/search/story-maintenance.ts
   ✅ apps/worker/src/lib/search/story-queue.ts
```

### Step 2: Run Runtime Tests
```bash
npm run test:runtime-story
```

**Expected output:**
```
✅ Elasticsearch Connection: Elasticsearch is accessible
✅ Elasticsearch Indices: Both indices exist
✅ Articles with Story IDs: Found 500 articles with storyIds
✅ Sample Story: Story abc-123 has 5 articles
✅ Article Embeddings: 5/5 articles have embeddings
✅ Story Metadata Computation: Story metadata computed successfully
✅ Story Index Update: Story updated in Elasticsearch
✅ Story Index Verification: Story document found in index
✅ Story Queue: Enqueued 3 stories for update
✅ Story Queue Flush: Queue flushed successfully

🎉 All tests passed!
```

### Step 3: Test Worker Integration

**Start the worker:**
```bash
npm run dev --workspace @news-api/worker
```

**Watch for:**
- ✅ "Worker service bootstrap complete" (no errors)
- ✅ Articles being enriched
- ✅ Story IDs being assigned
- ✅ Story queue enqueue messages

**After 5 minutes or 50 articles:**
- ✅ "Processing story updates" in logs
- ✅ "Updated stories in index" messages

### Step 4: Verify in Elasticsearch and PostgreSQL

```bash
# Check stories index in Elasticsearch
curl http://localhost:9200/news-stories-v1/_search?size=5 | jq '.hits.hits[]._source'

# Expected: Story documents with:
# - story_id
# - title_rep
# - summary
# - keywords
# - sources
# - time_range_start/end
# - centroid_embedding

# Check stories table in PostgreSQL
psql $DATABASE_URL -c "SELECT id, title_rep, created_at, updated_at FROM stories LIMIT 5;"

# Expected: Story records synchronized with Elasticsearch
```

## 📋 Prerequisites Checklist

Before running tests, ensure:

- [ ] **Elasticsearch running:**
  ```bash
  curl http://localhost:9200
  # Should return ES cluster info
  ```

- [ ] **Environment variables set:**
  ```bash
  # In .env file:
  SEARCH_ENABLED=true
  ELASTICSEARCH_NODE=http://localhost:9200
  # Optional:
  ELASTICSEARCH_USERNAME=elastic
  ELASTICSEARCH_PASSWORD=changeme
  ELASTICSEARCH_INDEX_PREFIX=news
  ```

- [ ] **Database has articles:**
  ```bash
  # Check article count
  psql $DATABASE_URL -c "SELECT COUNT(*) FROM articles;"
  ```

- [ ] **Articles have storyIds (optional for first test):**
  ```bash
  # If no storyIds, run backfill:
  npm run search:backfill -- --fromDays 1
  ```

## 🔧 Troubleshooting

### No Output from Scripts

If scripts run but produce no output:

1. **Check Node.js version:**
   ```bash
   node --version  # Should be >= 20.11.0
   ```

2. **Check if tsx is installed:**
   ```bash
   npm list tsx
   ```

3. **Run with explicit output:**
   ```bash
   node --loader tsx scripts/verify-story-setup.ts
   ```

### Elasticsearch Not Accessible

1. **Start Elasticsearch:**
   ```bash
   # Docker
   docker run -d -p 9200:9200 \
     -e "discovery.type=single-node" \
     -e "xpack.security.enabled=false" \
     elasticsearch:8.15.0
   ```

2. **Verify connection:**
   ```bash
   curl http://localhost:9200
   ```

3. **Check .env:**
   ```
   ELASTICSEARCH_NODE=http://localhost:9200
   ```

### No Articles with StoryIds

1. **Run backfill:**
   ```bash
   npm run search:backfill -- --fromDays 7
   ```

2. **Or let worker process articles:**
   ```bash
   npm run dev --workspace @news-api/worker
   # Wait for articles to be enriched
   ```

### Worker Won't Start

1. **Check for import errors:**
   ```bash
   npm run typecheck --workspace @news-api/worker
   ```

2. **Verify packages:**
   ```bash
   npm install
   ```

3. **Check logs:**
   - Look for specific error messages
   - Verify all dependencies installed

## 📊 What to Monitor

### During Testing:

1. **Worker Logs:**
   - Story IDs being assigned
   - Story queue enqueue messages
   - Story update processing

2. **Elasticsearch:**
   - Index document counts
   - Story documents appearing
   - Query performance

3. **Database:**
   - Articles getting storyIds
   - Story metadata accuracy

### Success Indicators:

✅ Worker starts without errors
✅ Articles get storyIds during enrichment
✅ Stories appear in ES after queue processing
✅ Story documents have all required fields
✅ No errors in logs

## 🎯 Next Steps After Successful Testing

1. **Monitor Production:**
   - Watch story queue processing frequency
   - Monitor ES index growth
   - Check story metadata quality

2. **Performance Tuning:**
   - Adjust debounce period if needed (currently 5 min)
   - Tune batch size (currently 50 stories)
   - Monitor ES write load

3. **Proceed to Phase 3:**
   - Implement Periodic Repair Job
   - Add cluster merge/split logic
   - Add centroid recomputation

## 📝 Test Results Template

After running tests, document:

```
Date: ___________
Tester: ___________

Environment:
- ES Version: ___________
- Node Version: ___________
- Articles in DB: ___________
- Articles with StoryIds: ___________

Test Results:
- Verification: ✅ / ❌
- Runtime Tests: ✅ / ❌
- Worker Startup: ✅ / ❌
- Story Updates: ✅ / ❌

Issues Found:
- ___________
- ___________

Notes:
- ___________
```

## 🎉 Success Criteria

Phase 2 is successfully tested when:

- ✅ All verification checks pass
- ✅ Runtime tests complete successfully
- ✅ Worker starts and processes articles
- ✅ Stories appear in Elasticsearch
- ✅ Story documents have complete metadata
- ✅ No errors in logs

**Ready to proceed to Phase 3!** 🚀

