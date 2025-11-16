# GTE-multilingual-base Embeddings (768-dim)

This system uses `thenlper/gte-multilingual-base` for sentence embeddings, with CLS pooling and L2 normalization. Vectors are 768-dimensional and indexed in Elasticsearch dense_vector fields with cosine similarity.

## Components

- Python service (`python/embeddings-service/`): FastAPI, exposes `POST /embed` for local embeddings.
- Node embedding provider: `HTTPEmbeddingProvider` calls the service; dimensions are set via `EMBEDDING_DIMENSIONS` (default 768).
- Elasticsearch indices: `articles` and `stories` are versioned (default v2) and use `search.embeddingDims` for `dims`.

## Running the Embedding Service

```bash
cd python/embeddings-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001
```

Health:

```bash
curl -s http://localhost:8001/health
```

Embed:

```bash
curl -s -X POST http://localhost:8001/embed \
  -H "Content-Type: application/json" \
  -d '{"text":"India launches a major renewable energy project."}'
```

## Configuration

Environment variables (examples):

```bash
# Enable search and set index version/dimensions
SEARCH_ENABLED=true
SEARCH_INDEX_VERSION=2
SEARCH_EMBEDDING_DIMS=768

# Point worker/API to the local embedding service
EMBEDDING_PROVIDER=http
EMBEDDING_ENDPOINT=http://localhost:8001/embed
EMBEDDING_TIMEOUT_MS=10000

# Optional: override dimensions in providers
EMBEDDING_DIMENSIONS=768
```

## Bootstrap v2 Indices

Indices are created automatically by the bootstrap step:

```bash
npm run tsx -- scripts/search-backfill.ts --fromDays 7 --batch 500 --concurrency 4
```

This will:
- Bootstrap indices (v2 by default)
- Re-embed articles using GTE (via HTTP provider)
- Index into the `articles-v2` index
- Recompute and update story centroids in `stories-v2`

## Cutover

- Default index version is controlled by `SEARCH_INDEX_VERSION`.
- To rollback, set it back to the previous version and redeploy.

## Notes

- GPU is optional; install the appropriate Torch wheel to enable CUDA.
- Consider ES HNSW parameters tuning and half-precision (`float16`) storage if size/perf becomes a concern.

