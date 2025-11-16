## GTE-multilingual-base (768) — End-to-End Implementation

This document describes the complete production implementation for local GTE embeddings with Elasticsearch kNN for news search and clustering.

### Goals
- Replace 384-dim vectors with 768-dim using GTE-multilingual-base
- Run the model locally (CPU or GPU) via a Python microservice
- Wire Node services to the microservice with robust retries/circuit breaker
- Create versioned ES indices with HNSW settings and configurable dims
- Provide backfill, cutover, and rollback instructions


## 1) Components & Data Flow
- Python service (`python/embeddings-service/`)
  - FastAPI app loading `thenlper/gte-multilingual-base`
  - Endpoints:
    - `POST /embed` → single text → 768-dim normalized vector
    - `POST /embed_batch` → array of texts → normalized vectors (recommended for throughput)
    - `GET /health`
  - CLS pooling + L2 normalization (GTE recipe)

- Node embedding providers (Worker & API)
  - `HTTPEmbeddingProvider`: calls the Python `/embed` endpoint (or `/embed_batch` if you adopt batching)
  - Circuit breaker, retries with backoff, request timeout
  - Dimensions sourced from `EMBEDDING_DIMENSIONS` (default 768)

- Elasticsearch indices (versioned)
  - `articles-v{indexVersion}` and `stories-v{indexVersion}`
  - `dense_vector` with `dims = search.embeddingDims`
  - `similarity: "cosine"`
  - HNSW index options (see below) for fast ANN

- Backfill pipeline
  - Recomputes article embeddings with GTE (768)
  - Indexes into `articles-v2`
  - Recomputes centroid embeddings for `stories-v2`


## 2) Configuration
Environment variables (examples):

```bash
# Search & index version
SEARCH_ENABLED=true
SEARCH_INDEX_VERSION=2
SEARCH_EMBEDDING_DIMS=768

# Embedding provider
EMBEDDING_PROVIDER=http
EMBEDDING_ENDPOINT=http://localhost:8001/embed
EMBEDDING_TIMEOUT_MS=10000
EMBEDDING_MAX_RETRIES=3
EMBEDDING_RETRY_INITIAL_DELAY_MS=1000
EMBEDDING_RETRY_MAX_DELAY_MS=8000
EMBEDDING_CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
EMBEDDING_CIRCUIT_BREAKER_SUCCESS_THRESHOLD=3
EMBEDDING_CIRCUIT_BREAKER_TIMEOUT_MS=30000

# Optional override in Node providers
EMBEDDING_DIMENSIONS=768

# kNN query-time tuning (if exposed via app config)
SEARCH_NUM_CANDIDATES=200
```

Config schema highlights:
- `search.embeddingDims` (default 768)
- `search.indexVersion` (default 2)


## 3) Python Embedding Service
Directory: `python/embeddings-service/`

- `requirements.txt` includes `fastapi`, `uvicorn`, `transformers`, `torch`, `sentencepiece`, `numpy`
- `model.py` loads model once, runs CLS pooling, L2 normalizes
- `main.py` exposes `/health`, `/embed`, `/embed_batch`
- `README.md` shows local run instructions

Run locally (CPU):
```bash
cd python/embeddings-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001
```

GPU (optional):
- Install CUDA-enabled `torch` per your environment (or use the CUDA Dockerfile)
- The service auto-selects `cuda` if available; otherwise `cpu`

Verify:
```bash
curl -s http://localhost:8001/health
curl -s -X POST http://localhost:8001/embed \
  -H "Content-Type: application/json" \
  -d '{"text":"India launches a major renewable energy project."}'
curl -s -X POST http://localhost:8001/embed_batch \
  -H "Content-Type: application/json" \
  -d '{"texts":["First text","Second text"]}'
```


## 4) Dockerization (Embedding Service)
CPU Dockerfile (suggested):

```dockerfile
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/root/.cache/huggingface

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential git && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Optional: warm model weights at build-time
RUN python - <<'PY'\nfrom transformers import AutoTokenizer, AutoModel\nm=\"thenlper/gte-multilingual-base\"\nAutoTokenizer.from_pretrained(m)\nAutoModel.from_pretrained(m)\nPY

COPY . .
EXPOSE 8001
CMD [\"uvicorn\", \"main:app\", \"--host\", \"0.0.0.0\", \"--port\", \"8001\"]
```

CUDA Dockerfile (optional):

```dockerfile
FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/root/.cache/huggingface

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv git && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir --index-url https://download.pytorch.org/whl/cu121 torch \
 && pip3 install --no-cache-dir -r requirements.txt

COPY . .
EXPOSE 8001
CMD [\"python3\", \"-m\", \"uvicorn\", \"main:app\", \"--host\", \"0.0.0.0\", \"--port\", \"8001\"]
```

`.dockerignore`:
```dockerignore
__pycache__/
*.pyc
.venv/
.git/
```

Build & run:
```bash
docker build -t gte-embeddings:cpu -f python/embeddings-service/Dockerfile python/embeddings-service
docker run --rm -p 8001:8001 gte-embeddings:cpu
```

CUDA build & run:
```bash
docker build -t gte-embeddings:cuda -f python/embeddings-service/Dockerfile.cuda python/embeddings-service
docker run --gpus all --rm -p 8001:8001 gte-embeddings:cuda
```
Health check:
```bash
curl -s http://localhost:8001/health
```


## 5) Elasticsearch Indices & HNSW
Indices are defined in `packages/search/src/indices.ts`. They are versioned with `search.indexVersion` and use `search.embeddingDims` for vector dims.

Recommended HNSW settings on vector fields:
```ts
// Set when cloning mappings prior to indices.create()
index_options: { type: "hnsw", m: 16, ef_construction: 100 }
```

Query-time kNN tuning:
```json
{
  "knn": {
    "field": "embedding",
    "query_vector": [ /* 768 floats */ ],
    "k": 10,
    "num_candidates": 200
  }
}
```

Notes:
- `m`: graph connectivity (higher → more memory, potentially better recall). Typical 8–32.
- `ef_construction`: build-time accuracy/speed trade-off. Typical 64–200.
- `num_candidates`: query-time recall/speed lever. Typical 100–1000.

Quick verification after bootstrap:
```bash
# Assuming SEARCH_INDEX_VERSION=2
curl -s -X GET "$ELASTICSEARCH_NODE/news-articles-v2/_count" | jq
curl -s -X GET "$ELASTICSEARCH_NODE/news-stories-v2/_count" | jq
```

## 6) Backfill & Cutover
Backfill:
```bash
npm run tsx -- scripts/search-backfill.ts --fromDays 7 --batch 500 --concurrency 4
```
This will bootstrap v2 indices (if absent), re-embed articles (768-dim), index into `articles-v2`, and recompute story centroids into `stories-v2`.

Cutover options:
- Config-driven: set `SEARCH_INDEX_VERSION=2` and redeploy services
- Aliases (optional): point aliases `articles`/`stories` to `-v2` for atomic swap

Rollback:
- Revert `SEARCH_INDEX_VERSION` or flip aliases back to `-v1`
- `EMBEDDING_PROVIDER` can be set to `mock` for emergency degradation

Smoke test the API query embeddings path:
```bash
# Ensure apps/api is running with EMBEDDING_PROVIDER=http and EMBEDDING_ENDPOINT set
curl -s 'http://localhost:3000/search?q=renewable%20energy&size=5'
```


## 7) Performance & Scaling
Throughput levers:
- Use `/embed_batch` to reduce per-request overhead (batch 32–128 typical)
- Increase Python workers (e.g., `--workers 2..4`) and enable HTTP keep-alive in callers
- Tune `num_candidates` for query recall vs. latency
- Consider half-precision in preprocessing pipelines; ES dense_vector stores float32
 - If using Docker: pin CPU limits and raise worker count accordingly (2–4)

Hardware guidance (approx.):
- CPU-only: 2–4 vCPUs, 4–8 GB RAM → good starting point
- GPU: single 8–16 GB GPU significantly increases throughput and reduces latency


## 8) Testing & Validation
Functional checks:
- `/health` returns okay and `/embed` returns vectors of length 768
- Backfill completes with low error rate
- Search results are returned with lower or comparable latency

Benchmarks:
- Run `scripts/benchmark-search.ts` for p50/p95/p99
- Compare `num_candidates` values: 100, 200, 400

Quality checks:
- Evaluate top-k precision manually on sample queries
- Validate clustering cohesion thresholds after moving to 768-dim


## 9) Troubleshooting
- High latency from `/embed`:
  - Ensure model warmed; batch inputs where possible
  - Increase Python workers; consider GPU
- Circuit breaker open:
  - Check service logs; raise timeouts; tune retry limits
- ES memory pressure:
  - Revisit HNSW `m`, `ef_construction`; `num_candidates` at query-time
  - Scale shards appropriately; consider limiting indexed fields
 - If bootstrap fails: check cluster permissions for index creation and mappings size limits


## 10) Future Enhancements
- Multi-text `/embed_batch` adoption in Node caller
- Request coalescing/caching for identical query texts
- Docker images with pre-baked weights for faster cold start
- Optional managed vector DB for specialized ANN features


