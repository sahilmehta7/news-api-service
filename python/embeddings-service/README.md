# GTE Embeddings Service (Local)

FastAPI microservice providing 768‑dim sentence embeddings using **thenlper/gte-multilingual-base** with CLS pooling + L2 normalization.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

To use GPU (optional), install a CUDA-enabled torch wheel per your environment.

## Run

```bash
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
  -d '{"text": "India launches a major renewable energy project."}'
```

Expected response (truncated):

```json
{
  "embedding": [0.01, -0.02, ...],
  "dims": 768,
  "model": "thenlper/gte-multilingual-base",
  "took_ms": 5.23
}
```

## Contract

- POST `/embed` accepts `{ "text": string }` and returns `{ "embedding": number[], "dims": 768, ... }`.
- Uses CLS pooling and L2 normalization.

## Notes

- First request will download the model (~400MB) and warm up.

## Docker & Compose

CPU image build and run:

```bash
docker build -t gte-embeddings:cpu -f Dockerfile .
docker run --rm -p 8001:8001 gte-embeddings:cpu
```

If you encounter 401 from Hugging Face in Docker, use one of the following:

- Host cache (recommended):

```bash
# Pre-cache on host (example using a local venv)
python3 -m venv ~/.gte-venv
source ~/.gte-venv/bin/activate
pip install --upgrade pip && pip install transformers torch sentencepiece
python3 - <<'PY'
from transformers import AutoTokenizer, AutoModel
m = "thenlper/gte-multilingual-base"
AutoTokenizer.from_pretrained(m, cache_dir="${HOME}/.cache/huggingface")
AutoModel.from_pretrained(m, cache_dir="${HOME}/.cache/huggingface")
print("Cached")
PY
deactivate

# Run with volume mount
docker run --rm -p 8001:8001 \
  -e HF_HOME=/root/.cache/huggingface \
  -v ${HOME}/.cache/huggingface:/root/.cache/huggingface \
  gte-embeddings:cpu
```

- Token-based:

```bash
export HUGGINGFACE_HUB_TOKEN=hf_xxx
docker run --rm -p 8001:8001 \
  -e HUGGINGFACE_HUB_TOKEN=$HUGGINGFACE_HUB_TOKEN \
  gte-embeddings:cpu
```

Compose (both options supported):

```bash
# Cache profile
docker compose --profile cache up --build \
  -e HF_HOME=/root/.cache/huggingface \
  -v ${HOME}/.cache/huggingface:/root/.cache/huggingface

# Token profile
docker compose --profile token up --build \
  -e HUGGINGFACE_HUB_TOKEN=$HUGGINGFACE_HUB_TOKEN
```

