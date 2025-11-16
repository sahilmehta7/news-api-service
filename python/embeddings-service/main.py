from __future__ import annotations

import time
from typing import Any, Dict
import os

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List

from model import GTEModel

app = FastAPI(title="GTE Embeddings Service", version="1.0.0")
_model: GTEModel | None = None


class EmbedRequest(BaseModel):
    # Accept any length; downstream tokenizer will truncate to max_length=512 tokens
    text: str = Field(..., min_length=0)


class EmbedResponse(BaseModel):
    embedding: list[float]
    dims: int
    model: str
    took_ms: float


class BatchRequest(BaseModel):
    texts: List[str] = Field(..., min_items=1)


class BatchResponse(BaseModel):
    embeddings: list[list[float]]
    dims: int
    model: str
    took_ms: float


@app.on_event("startup")
def load_model() -> None:
    global _model
    model_id = os.environ.get("MODEL_ID", "Alibaba-NLP/gte-multilingual-base")
    _model = GTEModel(model_id)


@app.get("/health")
def health() -> Dict[str, Any]:
    return {"status": "ok", "model": _model.model_name if _model else None, "dims": 768}


@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest) -> EmbedResponse:
    if _model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    start = time.perf_counter()
    try:
        # Accept empty or whitespace-only text by returning a deterministic unit vector
        text = req.text if req.text is not None else ""
        if text.strip() == "":
            # Unit vector e1 in R^dims to keep normalization semantics
            vec_list = [0.0] * _model.dimensions
            vec_list[0] = 1.0
            took_ms = (time.perf_counter() - start) * 1000.0
            return EmbedResponse(
                embedding=vec_list,
                dims=_model.dimensions,
                model=_model.model_name,
                took_ms=took_ms,
            )
        vec = _model.embed(text)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to compute embedding: {e}") from e
    took_ms = (time.perf_counter() - start) * 1000.0
    return EmbedResponse(
        embedding=vec.tolist(),
        dims=_model.dimensions,
        model=_model.model_name,
        took_ms=took_ms,
    )

@app.post("/embed_batch", response_model=BatchResponse)
def embed_batch(req: BatchRequest) -> BatchResponse:
    if _model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    start = time.perf_counter()
    try:
        texts = req.texts or []
        # Split into non-empty and empty; generate unit vector for empty
        embeddings: list[list[float]] = []
        to_compute: list[str] = []
        positions: list[int] = []
        for idx, t in enumerate(texts):
            if (t or "").strip() == "":
                vec_list = [0.0] * _model.dimensions
                vec_list[0] = 1.0
                embeddings.append(vec_list)
            else:
                embeddings.append([])  # placeholder
                to_compute.append(t)
                positions.append(idx)
        if to_compute:
            computed = _model.embed_batch(to_compute)
            comp_idx = 0
            for pos in positions:
                embeddings[pos] = computed[comp_idx].tolist()
                comp_idx += 1
        vecs = embeddings
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to compute embeddings: {e}") from e
    took_ms = (time.perf_counter() - start) * 1000.0
    return BatchResponse(
        embeddings=vecs,
        dims=_model.dimensions,
        model=_model.model_name,
        took_ms=took_ms,
    )


