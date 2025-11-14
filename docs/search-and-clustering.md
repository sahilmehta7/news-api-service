# Search & Story Clustering Implementation

Goals: deliver fast, relevant search over ~100k articles/day and group “same-story” articles across sources. This design integrates with the existing Node/Next.js monorepo, Fastify API, Prisma/PostgreSQL, and worker pipeline.

## 1) Scope & Scale
- Throughput: ~100k articles/day; embeddings for enriched content; hybrid BM25 + vector search.
- Latency targets: ES query p95 <150ms; end-to-end API p95 ≤300ms (aligned with PRD objectives).
- Storage: keep PostgreSQL as source of truth; Elasticsearch as search/cluster layer.

## 2) Architecture Fit (Context)
- Services (docs/architecture.md):
  - `apps/api`: Fastify HTTP API for articles/feeds/metrics.
  - `apps/worker`: ingestion + enrichment pipeline.
- Data model (prisma/schema.prisma): `feeds`, `articles`, `article_metadata`, `fetch_logs`. Full‑text currently via Postgres `tsvector` (see `apps/api/src/modules/articles/service.ts:98`).
- Admin (Next.js): management UI and metrics.

## 3) Data Model Changes (PostgreSQL)
Keep Postgres as source of truth for articles. Add a story grouping field and optional story metadata table.

Proposed Prisma changes (migration to be created later):

```prisma
// Add to model Article
storyId String? @map("story_id")

@@index([storyId], map: "articles_story_id_idx")

// Optional: new Story table for analytics/joins (ES can be sole store if preferred)
model Story {
  id              String   @id @default(uuid()) @db.Uuid
  titleRep        String?
  summary         String?
  keywords        Json?
  timeRangeStart  DateTime? @db.Timestamptz(6)
  timeRangeEnd    DateTime? @db.Timestamptz(6)
  createdAt       DateTime  @default(now()) @db.Timestamptz(6)
  updatedAt       DateTime  @default(now()) @updatedAt @db.Timestamptz(6)

  @@map("stories")
}
```

Notes:
- `storyId` provides fast grouping in DB and cross-linking to ES `story_id`.
- If you skip the `Story` table, maintain only ES `stories` index; the API can still fetch member articles by `storyId` from Postgres.

## 4) Search Layer (Elasticsearch)
Elasticsearch will host:
- `articles` index: hybrid BM25 + k‑NN on a dense vector embedding of the article content.
- `stories` index: representative cluster docs with centroid embeddings.

Index naming:
- Prefix with `ELASTICSEARCH_INDEX_PREFIX` (e.g., `news-articles-v1`, `news-stories-v1`).

Recommended mappings (simplified, production-ready defaults):

```json
{
  "settings": {
    "index": {
      "number_of_shards": 3,
      "number_of_replicas": 1
    },
    "analysis": {
      "analyzer": {
        "title_shingle": {
          "tokenizer": "standard",
          "filter": ["lowercase", "asciifolding", "shingle"]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "id": {"type": "keyword"},
      "feed_id": {"type": "keyword"},
      "source_url": {"type": "keyword"},
      "canonical_url": {"type": "keyword"},
      "title": {
        "type": "text",
        "fields": { "shingles": {"type": "text", "analyzer": "title_shingle"} }
      },
      "summary": {"type": "text"},
      "content": {"type": "text"},
      "author": {"type": "keyword"},
      "language": {"type": "keyword"},
      "keywords": {"type": "keyword"},
      "published_at": {"type": "date"},
      "fetched_at": {"type": "date"},
      "story_id": {"type": "keyword"},
      "content_hash": {"type": "keyword"},
      "embedding": {
        "type": "dense_vector",
        "dims": 384,
        "index": true,
        "similarity": "cosine"
      }
    }
  }
}
```

Stories index (centroids):

```json
{
  "settings": {
    "index": {"number_of_shards": 2, "number_of_replicas": 1}
  },
  "mappings": {
    "properties": {
      "story_id": {"type": "keyword"},
      "title_rep": {"type": "text"},
      "summary": {"type": "text"},
      "keywords": {"type": "keyword"},
      "sources": {"type": "keyword"},
      "time_range_start": {"type": "date"},
      "time_range_end": {"type": "date"},
      "centroid_embedding": {
        "type": "dense_vector",
        "dims": 384,
        "index": true,
        "similarity": "cosine"
      }
    }
  }
}
```

## 5) Configuration
Extend `@news-api/config` to include search settings (env-driven):

Environment variables (add to `.env`):

```
SEARCH_ENABLED=true
ELASTICSEARCH_NODE=http://localhost:9200
ELASTICSEARCH_USERNAME=elastic
ELASTICSEARCH_PASSWORD=changeme
ELASTICSEARCH_INDEX_PREFIX=news
SEARCH_DEFAULT_LANGUAGE=english
```

Config schema additions (packages/config):
- `search.enabled` (boolean, default false)
- `search.elasticsearch.node` (url), `username`, `password`, `indexPrefix`, `defaultLanguage`

## 6) Worker Pipeline Changes
Entry: on enrichment success (see `apps/worker/src/jobs/enrich-articles.ts`), index to ES and assign a `storyId`.

Steps per article:
1. Prepare text: prefer `contentPlain` else `title + ' ' + summary`.
2. Compute embedding (384 dims) via an embedding provider.
3. Upsert ES `articles` doc with embedding + metadata.
4. Assign/attach to a story cluster (see §7) and set `storyId` in DB and `story_id` in ES.

Embedding provider interface:
- Abstraction with one method: `embed(text): Promise<number[]>`.
- Providers: Node-native model, local Python sidecar (sentence-transformers), or hosted service.
- Timeout + retry with backoff; circuit-breaker to avoid request pileups.

Bulk indexing:
- Queue documents into batches (~500 docs or ~1–5MB) with gzip; retry with exponential backoff.
- Track metrics: successes/failures, latency, queue size (follow worker metrics pattern in `apps/worker/src/metrics/registry.ts`).

## 7) Story Grouping (Clustering)
Window: incremental clustering over a sliding 48–72h window.

Candidate retrieval for a new article A:
- ES k‑NN over `embedding` (top 200 candidates in last 72h).
- Optional: title shingles Jaccard and named-entity overlap to guard syndication near-duplicates.

Edge criteria:
- Same-story if any of:
  - cosine_sim ≥ 0.82 on embeddings, or
  - Jaccard(title shingles) ≥ 0.5, or
  - high entity overlap.

Cluster maintenance:
- Compute connected components over candidates to find A's cluster.
- storyId = stable derived ID, e.g., UUIDv5 of the earliest article id in the component.
- Maintain centroid vector = mean of member embeddings and update `stories` index:
  - `title_rep`: medoid article title.
  - `summary`: simple lead‑3 sentences from top article.
  - `time_range_start/end` from member `published_at`.
  - **PostgreSQL `stories` table synchronized with Elasticsearch**.
- Periodic repair job (every 15–30 min): recompute centroids, merge tiny/overlapping clusters, split if cohesion (mean cosine) drops.

## 8) Search Behavior & Queries
Articles hybrid query (union BM25 + k‑NN, rerank with recency):

```json
{
  "size": 20,
  "query": {
    "bool": {
      "must": [{"multi_match": {"query": "apple earnings guidance", "fields": ["title^3","content","keywords^2"]}}],
      "filter": [{"range": {"published_at": {"gte": "now-7d"}}}]
    }
  },
  "knn": {"field": "embedding", "query_vector": [/* 384 dims */], "k": 200, "num_candidates": 1000},
  "rescore": [{
    "window_size": 200,
    "query": {"rescore_query": {"function_score": {
      "functions": [{"exp": {"published_at": {"origin": "now","scale": "3d","decay": 0.5}}, "weight": 0.2}],
      "score_mode": "sum", "boost_mode": "sum"
    }}}
  }]
}
```

Story search:
- Run similar hybrid query over `stories` (`title_rep`, `summary`, `centroid_embedding`).
- For each story hit, fetch top N member articles by `storyId` from Postgres (diverse sources, recent first).

Diversification:
- When returning article results, diversify by `story_id` so first page shows distinct stories; provide “view more from this story”.

Fallback:
- If `SEARCH_ENABLED=false`, use existing Postgres full‑text (`apps/api/src/modules/articles/service.ts:98`, `:104`).

## 9) API Surface (Fastify)
New routes in `apps/api`:

- `GET /search`
  - Params: `q`, `from`, `to`, `language`, `feedId`, `size`, `offset`, `groupByStory` (bool).
  - Behavior: delegates to ES hybrid search; if `groupByStory=true`, apply diversification and include per‑story counts.

- `GET /stories`
  - Params: `q`, `from`, `to`, `language`, `size`, `offset`.
  - Behavior: search `stories` index and join top N members per story via DB.

- `GET /stories/:id`
  - Behavior: returns story metadata (from ES or DB) + paginated member articles from Postgres by `storyId`.

Security: same admin API key header. Add lightweight rate limiting at the API router for public endpoints if exposed.

## 10) Admin UI (Next.js)
- New `/stories` page: story-first view with time window chips, source diversity badges, and link to details.
- Articles explorer: “Group similar” toggle to apply story diversification and link to `/stories/:id`.
- Settings: indicate whether ES-backed search is enabled and show basic ES health.

## 11) Backfill & Maintenance
Backfill script (`scripts/search-backfill.ts`):
- Inputs: `--fromDays 7` (or `--from ISO`/`--to ISO`), `--batch 500`, `--concurrency 4`.
- Flow: scan articles in window → compute embeddings → bulk index to ES → cluster → update `storyId` in DB.

Periodic jobs (worker):
- Recluster 72h window every 15–30 minutes (idempotent/merge-safe).
- Merge tiny clusters; recompute centroids/time ranges.

## 12) Ops, Monitoring, Runbook
Metrics (Prometheus style, align with existing names under `apps/worker/src/metrics/registry.ts`):
- `news_search_index_docs_total{status="success|failure"}`
- `news_search_index_duration_seconds`
- `news_search_knn_queries_total`
- `news_search_knn_query_duration_seconds`
- `news_search_clusters_total{action="create|merge|split"}`
- `news_search_cluster_duration_seconds`

Health:
- `/health` includes ES connectivity and index existence check.
  - If ES down, API can fall back to Postgres full‑text for `/articles` while `/search` reports temporarily unavailable.

Runbook entries:
- Recreate indices (with mappings), reindex window, recluster window.
- Rotate ES credentials; verify via admin settings “Test search connection”.

## 13) Risks & Mitigations (PRD §7)
- Embedding provider instability → circuit breaker, retries, and offline queue.
- Over/under‑clustering → monitor cohesion/purity; adjust thresholds.
- Index growth → ILM or periodic rollover; compress vectors (float16/PQ) if needed.
- Multilingual content → default english analyzer; add per‑language analyzers if language distribution demands.

## 14) Rollout Plan
Phase 0: Infra & config
- Provision ES; set env vars; add config schema for search.

Phase 1: Indices & client package
- Create `@news-api/search` package with client factory, index bootstrap, bulk index, and query builders.
- Bootstrap `articles`/`stories` indices with mappings.

Phase 2: Worker integration
- Add embedding provider and ES indexing on enrichment success.
- Implement incremental clustering and `storyId` updates.

Phase 3: API
- Add `/search`, `/stories`, `/stories/:id` routes.
- Keep `/articles` Postgres path as fallback; optional flag to delegate to ES.

Phase 4: Admin UI
- Add `/stories` page and “Group similar” toggle in articles explorer.

Phase 5: Backfill & validate
- Backfill last N days; validate search relevance and cluster purity on labeled set.
- Tune thresholds and ranking weights; monitor latency/throughput.

## 15) Appendix

Example union results diversification (story-first):
- Retrieve top 200 union of BM25 and k‑NN.
- Group by `story_id`; take top 1 representative per group until page size; keep a `moreCount` per story for UI.

Representative scoring (tunable):
```
score = 0.6 * bm25_norm + 0.3 * (1 + cosine_sim) + 0.1 * recency_decay
```

File references for current behavior and integration points:
- API SQL full‑text relevance: `apps/api/src/modules/articles/service.ts:98`
- API SQL full‑text filter: `apps/api/src/modules/articles/service.ts:104`
- Enrichment success update point (hook for indexing): `apps/worker/src/jobs/enrich-articles.ts:248`

Deliverables checklist:
- [x] Prisma migration for `storyId` + optional `Story` model.
- [x] `@news-api/search` package (client, bootstrap, bulk index, queries).
- [x] Worker: embedding provider + ES indexing + clustering.
- [x] API routes: `/search`, `/stories`, `/stories/:id`.
- [x] Admin UI: `/stories`, articles "Group similar" toggle.
- [x] Backfill script + runbook entries.
- [x] **Stories index maintenance** (Phase 2).
- [x] **PostgreSQL story synchronization**.
- [x] **Periodic repair job** (Phase 3).
- [x] **True hybrid search union** (BM25 + k-NN) (Phase 4.1).
- [x] **Story diversification in search results** (Phase 4.2).
- [x] **Query embedding computation** (Phase 4.3).
- [x] **Embedding provider enhancements** (Phase 5): Circuit breaker, retry with backoff, metrics, Node provider placeholder.
- [x] **Advanced clustering features** (Phase 6): Jaccard similarity for title shingles, named entity overlap, combined similarity score.
- [x] **Admin settings UI** (Phase 7): Search health component, ES connection status, index health metrics, configuration display.
- [x] **Testing & validation** (Phase 8): Unit tests, integration tests, performance benchmarks.

