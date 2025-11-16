# Embeddings Integration – Implementation Plan

## Goals
- Integrate a reusable `EmbeddingProvider` into the background worker to generate sentence embeddings for articles during enrichment.
- Use embeddings for:
  - Story clustering/assignment.
  - Elasticsearch indexing (dense_vector) to enable ANN search and later semantic features.
- Make provider pluggable: mock (dev), HTTP service (Python FastAPI), optional node-local model (future).
- Provide robust reliability via retries, timeouts, and circuit breaker with Prometheus metrics.

## Scope
- Worker service only (apps/worker). API app may optionally decorate the same provider for future endpoints, but that is out of primary scope.
- Elasticsearch indices must be bootstrapped with correct `dims` and HNSW options.

## Architecture Overview
- `EmbeddingProvider` interface with implementations:
  - `MockEmbeddingProvider`: deterministic normalized vector for dev/tests.
  - `HTTPEmbeddingProvider`: POST to embedding microservice (`/embed`) with circuit breaker + retry.
  - `NodeEmbeddingProvider`: placeholder for on-node `@xenova/transformers` (future).
- Provider resolution via env:
  - `EMBEDDING_PROVIDER` ∈ {`mock`, `http`, `node`}
  - `EMBEDDING_ENDPOINT` used when `http`.
  - Optional retry and circuit breaker tuning via env.
- Worker lifecycle:
  1) `createWorkerContext` creates `embeddingProvider`.
  2) Enrichment job extracts text → `embeddingProvider.embed(text)`.
  3) Use embedding to assign `story_id` and build `ArticleDocument`.
  4) Bulk index document (with `embedding`) into Elasticsearch.

### Key Code Paths (already implemented)
- Provider factory and HTTP provider
  - `apps/worker/src/lib/embeddings/provider.ts`
- Optional node provider (placeholder)
  - `apps/worker/src/lib/embeddings/node-provider.ts`
- Worker wiring
  - `apps/worker/src/context.ts` (loads `createEmbeddingProvider()` into context)
- Enrichment integration point
  - `apps/worker/src/jobs/enrich-articles.ts` (computes embedding, clustering, then index)
- Index bootstrap with embedding dims
  - `packages/search/src/indices.ts` (injects `config.search.embeddingDims` into mapping with HNSW)
- Metrics
  - `apps/worker/src/metrics/registry.ts` (requests, duration, retries, circuit state)

## Configuration
Set in `.env` or deployment environment:

```
# Provider selection
EMBEDDING_PROVIDER=http
EMBEDDING_ENDPOINT=http://localhost:8001/embed

# Timeouts/retry/circuit breaker (tune as needed)
EMBEDDING_TIMEOUT_MS=10000
EMBEDDING_MAX_RETRIES=3
EMBEDDING_RETRY_INITIAL_DELAY_MS=1000
EMBEDDING_RETRY_MAX_DELAY_MS=8000
EMBEDDING_CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
EMBEDDING_CIRCUIT_BREAKER_SUCCESS_THRESHOLD=3
EMBEDDING_CIRCUIT_BREAKER_TIMEOUT_MS=30000

# Search settings (must match model output dims)
SEARCH_ENABLED=true
SEARCH_EMBEDDING_DIMS=768
ELASTICSEARCH_NODE=http://localhost:9200
ELASTICSEARCH_INDEX_PREFIX=news
SEARCH_DEFAULT_LANGUAGE=english
```

Python service (reference) contract:
- POST `/embed` accepts `{ "text": string }`
- Returns `{ "embedding": number[], "dims": number, ... }`

## Implementation Steps
1) Prerequisites
   - Elasticsearch available and reachable per `ELASTICSEARCH_NODE`.
   - Embedding service running if using HTTP provider (see `python/embeddings-service/README.md` for startup).
   - Ensure `SEARCH_EMBEDDING_DIMS` equals service/model dims (e.g., 768).

2) Provider wiring (already present)
   - `createWorkerContext` creates `embeddingProvider` based on env.
   - Enrichment calls `context.embeddingProvider.embed(text)`.

3) Index bootstrap
   - On first run or via a one-time operational task, ensure indices are created with correct dims:
     - `packages/search/src/indices.ts` sets `dense_vector.dims` from config and enables HNSW.
   - If dims change, indices must be recreated (see Backout & Recovery).

4) Metrics and Observability
   - Prometheus metrics exposed by worker:
     - Requests, duration, retries, circuit state, ANN query timings, indexing throughput.
   - Add dashboard panels:
     - Embedding request rate/success/failure
     - Circuit breaker state over time
     - Enrichment duration p95
     - k-NN latency p95
     - Indexing success/failure

5) Optional Node provider (future)
   - Install: `npm i @xenova/transformers`
   - Implement lazy model load in `NodeEmbeddingProvider` to replace placeholder.
   - Set `EMBEDDING_PROVIDER=node` and optionally `EMBEDDING_MODEL` to override default.

## Rollout Plan
1) Stage/Dev
   - Use `MockEmbeddingProvider` (`EMBEDDING_PROVIDER=mock`) to validate flow and indices.
   - Verify enrichment completes, documents index with dummy vectors, search cluster health is green.
2) Pre-Prod
   - Switch to `HTTPEmbeddingProvider` pointing at staging embedding service.
   - Validate ANN queries and clustering quality on a subset of recent articles.
3) Prod
   - Deploy embedding service with autoscaling or resource guarantees.
   - Enable in worker via env flip.
   - Monitor metrics closely for timeouts, retries, and circuit breaker events.

## Testing & Validation
- Unit
  - Provider factory chooses correct implementation given env.
  - HTTP provider handles non-200 responses, timeouts, and retries.
- Integration
  - End-to-end enrichment flow produces embeddings and indexes successfully.
  - ANN k-NN queries return results with expected latency.
- Data correctness
  - Validate vector dimension equals `SEARCH_EMBEDDING_DIMS`.
  - Verify clustering coherence on a sample day of articles.
- Performance
  - Measure enrichment throughput with embeddings enabled vs disabled.
  - Ensure index bulk latency remains within SLA.

## Monitoring & Alerts
- Alert on:
  - High `news_embedding_requests_total{status="error"}` or `circuit_breaker_open` rate.
  - Elevated `news_embedding_duration_seconds` p95.
  - k-NN query latency spikes (`news_search_knn_query_duration_seconds`).
  - Bulk index failures (`news_search_index_docs_total{status="failure"}`).
- Track `news_embedding_circuit_breaker_state` gauge for reliability posture.

## Risks & Mitigations
- Embedding service outage → Circuit breaker opens and provider returns dummy vectors.
  - Mitigation: Alerts; failover to mock temporarily; scale service.
- Dimensionality mismatch between service and index → Index errors or poor search.
  - Mitigation: Enforce config alignment in deployment pipelines; smoke tests on startup.
- Latency increases enrichment time → Backlog growth.
  - Mitigation: Increase enrichment concurrency; optimize model; scale service; tune timeouts.

## Backout & Recovery
- If embeddings cause production impact:
  1) Flip to `EMBEDDING_PROVIDER=mock` to keep pipeline healthy.
  2) Pause reclustering if needed while investigating.
  3) If dims were changed incorrectly, recreate indices:
     - Create new index version with correct dims (`SEARCH_INDEX_VERSION=next`), reindex from DB via a backfill, then alias cutover or version flip in config.

## Operational Notes
- Ensure `.env` in worker and embedding service are committed to secrets management.
- Keep `SEARCH_INDEX_VERSION` bump strategy for mapping changes.
- For HTTP provider, place the embedding service near the worker to minimize latency.

## Deliverables Checklist
- Env configured and secrets provisioned.
- Embedding service deployed (if HTTP).
- Worker running with chosen provider.
- Indices bootstrapped with correct dims.
- Dashboards and alerts in place.
- Playbook documented for backout and reindex.


