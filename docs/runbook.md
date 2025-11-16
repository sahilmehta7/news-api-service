# Deployment Runbook

## Prerequisites

- PostgreSQL 15+ with the `pgcrypto` and `pg_trgm` extensions enabled.
- Node.js 20.11+ and npm 11+ installed on the target environment.
- Environment variables configured (`DATABASE_URL`, `API_ADMIN_KEY`, optional monitoring overrides, `SEARCH_ENABLED`, Elasticsearch connection vars, embedding provider settings, and `NEXT_PUBLIC_API_BASE_URL`/`NEXT_PUBLIC_WORKER_METRICS_URL`/`NEXT_PUBLIC_API_METRICS_URL` for the admin UI).
- Network access from the worker to external RSS sources.
- Elasticsearch 8.x (optional, for search and clustering features). Set `SEARCH_ENABLED=true` and configure `ELASTICSEARCH_NODE`, `ELASTICSEARCH_USERNAME`, `ELASTICSEARCH_PASSWORD`, `ELASTICSEARCH_INDEX_PREFIX`, and `SEARCH_DEFAULT_LANGUAGE`.
- Embedding provider configuration (enable local GTE by setting provider to http):
  - `EMBEDDING_PROVIDER` (`mock` | `http` | `node`)
  - `EMBEDDING_ENDPOINT` (HTTP provider)
  - `EMBEDDING_TIMEOUT_MS`
  - `EMBEDDING_MAX_RETRIES`, `EMBEDDING_RETRY_INITIAL_DELAY_MS`, `EMBEDDING_RETRY_MAX_DELAY_MS`
  - `EMBEDDING_CIRCUIT_BREAKER_FAILURE_THRESHOLD`, `EMBEDDING_CIRCUIT_BREAKER_SUCCESS_THRESHOLD`, `EMBEDDING_CIRCUIT_BREAKER_TIMEOUT_MS`
  - `EMBEDDING_MODEL` (Node provider placeholder)
  - `EMBEDDING_DIMENSIONS` (optional override; default 768)
  - `SEARCH_INDEX_VERSION` (default 2), `SEARCH_EMBEDDING_DIMS` (default 768)

## First-Time Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Generate Prisma Client (optional when schema changes):
   ```bash
   npm run prisma:generate
   ```
3. Apply database migrations:
   ```bash
   npm run prisma:migrate
   ```
4. Seed the feed catalogue if required by inserting rows into the `feeds` table.

## Local Validation

- Run the API in development mode:
  ```bash
  npm run dev --workspace @news-api/api
  ```
- Run the worker service:
  ```bash
  npm run dev --workspace @news-api/worker
  ```
- Run the admin interface (requires `NEXT_PUBLIC_API_BASE_URL` pointing at the API):
  ```bash
  npm run dev --workspace @news-api/admin
  ```
- Sign in at http://localhost:3000/login with the configured `API_ADMIN_KEY`.
- If the API or worker fails with `EADDRINUSE`, stop the conflicting process (`lsof -i :3000` or `lsof -i :9300`) or update the port in your environment variables before restarting.
- Execute the Vitest suite:
  ```bash
  npm run test
  ```

## Production Deployment

1. Build artifacts:
   ```bash
   npm run build
   ```
2. Configure process managers (e.g., systemd, PM2) to start:
   - `node apps/api/dist/index.js`
   - `node apps/worker/dist/index.js`
3. Ensure the worker process receives the same environment file as the API.

## Monitoring & Observability

- API health check: `GET /health` (includes Elasticsearch status when search is enabled)
- API metrics: `GET /metrics` (Prometheus format)
- Worker metrics: `http://<metrics_host>:<metrics_port>/metrics`
- Review ingestion/enrichment logs for `Feed ingestion succeeded` and `Article enrichment succeeded` messages.
- Admin metrics dashboard: `/metrics` within the admin UI visualizes API and worker summaries.
- Admin logs view: `/logs` exposes fetch/enrichment attempts with filters and stack traces for debugging.
- Search metrics (when enabled):
  - `news_search_index_docs_total{status="success|failure"}`: Documents indexed
  - `news_search_index_duration_seconds`: Indexing latency
  - `news_search_knn_queries_total`: k-NN queries executed
  - `news_search_knn_query_duration_seconds`: Query latency
  - `news_search_clusters_total{action="create|merge|split"}`: Cluster operations
  - `news_search_cluster_duration_seconds`: Clustering latency

## Manual Operations

- **Trigger a feed ingestion immediately**  
  Use the admin UI “Ingest feed” button or call:  
  ```bash
  curl -X POST \
    -H "X-API-Key: ${API_ADMIN_KEY}" \
    "{{baseUrl}}/feeds/<feedId>/ingest"
  ```
- **Retry enrichment for a failed article**  
  Use the “Retry enrichment” button in the article drawer or run:  
  ```bash
  curl -X POST \
    -H "X-API-Key: ${API_ADMIN_KEY}" \
    "{{baseUrl}}/articles/<articleId>/retry-enrichment"
  ```
- **Bulk retry enrichment for failed articles**  
  Use the “Retry failed enrichment” action on the Articles page or run:  
  ```bash
  curl -X POST \
    -H "X-API-Key: ${API_ADMIN_KEY}" \
    "{{baseUrl}}/articles/retry-enrichment/bulk"
  ```
- **Remove historical duplicates (global `source_url` check)**  
  ```bash
  npm run cleanup:dedupe-articles
  ```
  The script keeps the most recent article per `source_url` and deletes older copies and their metadata.

- **Backfill search index**  
  Index historical articles into Elasticsearch and assign story clusters:  
  ```bash
  npm run search:backfill -- --fromDays 7
  ```
  Options:
  - `--fromDays N`: Backfill articles from the last N days (default: 7)
  - `--from ISO_DATE`: Start date in ISO format (e.g., `2024-01-01T00:00:00Z`)
  - `--to ISO_DATE`: End date in ISO format
  - `--batch N`: Batch size for processing (default: 500)
  - `--concurrency N`: Number of concurrent operations (default: 4)
  
  Example: Backfill last 30 days with larger batches:
  ```bash
  npm run search:backfill -- --fromDays 30 --batch 1000
  ```

- **Start local GTE embedding service (CPU)**  
  ```bash
  cd python/embeddings-service
  python -m venv .venv
  source .venv/bin/activate
  pip install -r requirements.txt
  uvicorn main:app --host 0.0.0.0 --port 8001
  ```
  Verify:
  ```bash
  curl -s http://localhost:8001/health | jq
  curl -s -X POST http://localhost:8001/embed -H "Content-Type: application/json" -d '{"text":"hello world"}' | jq '.dims'
  ```
  Configure the API/worker to use it:
  ```bash
  export EMBEDDING_PROVIDER=http
  export EMBEDDING_ENDPOINT=http://localhost:8001/embed
  export SEARCH_ENABLED=true
  export SEARCH_INDEX_VERSION=2
  export SEARCH_EMBEDDING_DIMS=768
  ```
  Re-run the worker/API and backfill as needed.

- **Verify Elasticsearch health**  
  Check cluster status via API health endpoint:
  ```bash
  curl "{{baseUrl}}/health" | jq '.checks.elasticsearch'
  ```
  Expected values: `"up"` (healthy), `"disabled"` (search disabled), `"down"` (connection failed).

## Verification Checklist

- `GET /feeds` returns registered feeds with `stats.articleCount`.
- `GET /feeds/:id/stats` shows non-zero totals after running the worker.
- `GET /articles` responds with paginated data and accepts filters (e.g., `?feedId=...&hasMedia=true`).
- Metrics endpoints expose counters (`news_api_http_requests_total`, `news_worker_ingestion_attempts_total`, etc.).
- Tests pass (`npm run test`).
- Admin UI feed management reflects database updates and supports CRUD workflows.
- Admin metrics page reports queue size and request counters without errors.
- Admin log viewer surfaces recent fetch attempts, including failures when they are induced.
- If search is enabled:
  - `GET /health` reports `elasticsearch: "up"`.
  - `GET /search?q=test` returns relevant articles (hybrid BM25 + k-NN).
  - `GET /stories` returns clustered story groups.
  - Admin articles page "Group similar" toggle diversifies results by story.
  - Admin stories page displays clustered articles with metadata.

## Admin Access & API Key Rotation

- The admin UI stores the API key in browser local storage. Update the key via the Settings page or by clearing the key and signing in again.
- After rotating `API_ADMIN_KEY`, redeploy the API and worker, then use the Settings page "Test connection" action to validate the new key.
- Unauthorized responses automatically clear stored keys and redirect operators to the login screen.

## Rollback

- Stop worker and API processes.
- Restore the database from the latest backup (if a migration caused issues).
- Redeploy the previous release artifacts and restart services.

