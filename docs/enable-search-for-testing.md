# Enabling Search for Runtime Testing

## Quick Setup

### Option 1: Enable Search (Recommended for Testing)

1. **Check your `.env` file:**
   ```bash
   cat .env | grep SEARCH
   ```

2. **Add or update these variables:**
   ```bash
   # Enable search features
   SEARCH_ENABLED=true
   
   # Elasticsearch connection (default if not set)
   ELASTICSEARCH_NODE=http://localhost:9200
   
   # Optional: If ES requires authentication
   # ELASTICSEARCH_USERNAME=elastic
   # ELASTICSEARCH_PASSWORD=changeme
   
   # Optional: Custom index prefix (default: news)
   # ELASTICSEARCH_INDEX_PREFIX=news
   ```

3. **(Optional) Configure the embedding provider:**
   ```bash
   # Provider options: mock | http | node (default: mock)
   # Use "mock" for local testing without external services.
   EMBEDDING_PROVIDER=mock
   
   # HTTP provider settings (only needed if EMBEDDING_PROVIDER=http)
   # EMBEDDING_ENDPOINT=https://your-embedding-service.example.com/embed
   # EMBEDDING_TIMEOUT_MS=10000
   # EMBEDDING_MAX_RETRIES=3
   # EMBEDDING_RETRY_INITIAL_DELAY_MS=1000
   # EMBEDDING_RETRY_MAX_DELAY_MS=8000
   # EMBEDDING_CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
   # EMBEDDING_CIRCUIT_BREAKER_SUCCESS_THRESHOLD=3
   # EMBEDDING_CIRCUIT_BREAKER_TIMEOUT_MS=30000
   
   # Node provider (requires @xenova/transformers, currently placeholder)
   # EMBEDDING_PROVIDER=node
   # EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
   ```

4. **Start Elasticsearch:**
   
   **Using Docker (easiest):**
   ```bash
   docker run -d \
     --name elasticsearch \
     -p 9200:9200 \
     -p 9300:9300 \
     -e "discovery.type=single-node" \
     -e "xpack.security.enabled=false" \
     elasticsearch:8.15.0
   ```
   
   **Or use your existing ES setup**

5. **Verify ES is running:**
   ```bash
   curl http://localhost:9200
   ```
   
   Should return ES cluster information.

6. **Run tests again:**
   ```bash
   npm run test:runtime-story
   ```

### Option 2: Test Without Elasticsearch

If you don't want to set up Elasticsearch right now, the test will:
- ✅ Still check database for articles with storyIds
- ✅ Verify implementation files exist
- ⚠️ Skip ES-dependent tests

The test will exit gracefully with instructions.

## Verification

After enabling search, verify:

```bash
# 1. Check configuration
npm run verify:story-setup

# 2. Run full tests
npm run test:runtime-story

# 3. Check ES health
curl http://localhost:9200/_cluster/health
```

## Troubleshooting

### "Cannot connect to Elasticsearch"

1. **Check if ES is running:**
   ```bash
   curl http://localhost:9200
   ```

2. **Check Docker container (if using Docker):**
   ```bash
   docker ps | grep elasticsearch
   docker logs elasticsearch
   ```

3. **Check port:**
   ```bash
   lsof -i :9200
   ```

### "Search is disabled"

- Make sure `.env` file has `SEARCH_ENABLED=true`
- Restart the worker/test script after changing `.env`
- Check for typos: `SEARCH_ENABLED=true` (not `false`)

### ES Connection Refused

- ES might not be running
- Wrong port in `ELASTICSEARCH_NODE`
- Firewall blocking connection
- ES running on different host

## Next Steps

Once search is enabled:
1. ✅ Run verification: `npm run verify:story-setup`
2. ✅ Run full tests: `npm run test:runtime-story`
3. ✅ Start worker: `npm run dev --workspace @news-api/worker`
4. ✅ Monitor story updates in logs
5. ✅ Verify PostgreSQL `stories` table is populated:
   ```bash
   psql $DATABASE_URL -c "SELECT COUNT(*) FROM stories;"
   ```

## Recent Improvements

- ✅ **PostgreSQL Synchronization**: Story records are now synchronized between Elasticsearch and PostgreSQL
- ✅ **Error Handling**: Improved handling of articles not in Elasticsearch (404 errors are expected and handled gracefully)
- ✅ **Type Safety**: All TypeScript errors resolved

