from __future__ import annotations

from typing import Optional
from typing import List
import os

import numpy as np
import torch
from transformers import AutoModel, AutoTokenizer


class GTEModel:
    """
    Thin wrapper around thenlper/gte-multilingual-base with CLS pooling and L2 normalization.
    """

    def __init__(self, model_name: str = "Alibaba-NLP/gte-multilingual-base", device: Optional[str] = None) -> None:
        self.model_name = model_name
        token = os.environ.get("HUGGINGFACE_HUB_TOKEN")
        cache_dir = os.environ.get("HF_HOME")
        # Prefer local cache first, then fallback to network with optional token
        try:
            self.tokenizer = AutoTokenizer.from_pretrained(
                model_name,
                cache_dir=cache_dir,
                local_files_only=True,
                trust_remote_code=True
            )
            self.model = AutoModel.from_pretrained(
                model_name,
                cache_dir=cache_dir,
                local_files_only=True,
                trust_remote_code=True
            )
        except Exception:
            self.tokenizer = AutoTokenizer.from_pretrained(
                model_name,
                cache_dir=cache_dir,
                token=token,
                trust_remote_code=True
            )
            self.model = AutoModel.from_pretrained(
                model_name,
                cache_dir=cache_dir,
                token=token,
                trust_remote_code=True
            )
        self.model.eval()

        if device is None:
            device = "cuda" if torch.cuda.is_available() else "cpu"
        self.device = torch.device(device)
        self.model.to(self.device)

        # Known dim for gte-multilingual-base
        self.dimensions: int = 768

    @torch.inference_mode()
    def embed(self, text: str) -> np.ndarray:
        inputs = self.tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        output = self.model(**inputs)
        # CLS pooling
        cls_embedding = output.last_hidden_state[:, 0, :]  # shape: (1, hidden_size)
        # L2 normalize
        normalized = torch.nn.functional.normalize(cls_embedding, p=2, dim=1)
        vec = normalized.squeeze(0).detach().cpu().numpy().astype(np.float32)
        return vec

    @torch.inference_mode()
    def embed_batch(self, texts: List[str]) -> np.ndarray:
        if not texts:
            return np.empty((0, self.dimensions), dtype=np.float32)
        encoded = self.tokenizer(
            texts,
            return_tensors="pt",
            truncation=True,
            max_length=512,
            padding=True,
        )
        encoded = {k: v.to(self.device) for k, v in encoded.items()}
        output = self.model(**encoded)
        cls_embeddings = output.last_hidden_state[:, 0, :]  # (batch, hidden)
        normalized = torch.nn.functional.normalize(cls_embeddings, p=2, dim=1)
        vecs = normalized.detach().cpu().numpy().astype(np.float32)
        return vecs


