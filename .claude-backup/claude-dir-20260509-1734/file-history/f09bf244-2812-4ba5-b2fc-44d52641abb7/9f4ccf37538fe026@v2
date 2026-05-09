"""Recall: semantic retrieval over past interactions.

At startup we load all interaction JSONLs from
`/shared-docker/data/interactions/`, embed each row's searchable text
(response + user_correction + question) using
`paraphrase-multilingual-MiniLM-L12-v2`, and keep the embeddings in
memory. /recall queries are embedded the same way and matched against
the index with cosine similarity, then weighted by recency (48-hour
exponential decay).

Multilingual MiniLM is the right model for our demo language: it
handles English and Roman Urdu in the same embedding space, so a
"where did I put my keys" query can match a "Sara ne keys table par
rakhi" memory.

Memory cost: ~120 MB host RAM for the model, ~1.5 KB per indexed row
(384 floats × 4 bytes). At our scale (low hundreds of rows) that's
negligible — no need for sqlite-vss / faiss yet.

GPU not used. CPU embedding is fast enough at this scale (~1 ms per
query, ~10 ms to embed a batch of 41 rows at startup).
"""

from __future__ import annotations

import glob
import json
import logging
import threading
import time
from datetime import UTC, datetime

import numpy as np
from sentence_transformers import SentenceTransformer

logger = logging.getLogger("livesight.recall")

JSONL_GLOB = "/shared-docker/data/interactions/*.jsonl"
MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
RECENCY_HALFLIFE_HOURS = 48.0  # 2-day decay

_model: SentenceTransformer | None = None
_entries: list[dict] = []
_embeddings: np.ndarray | None = None
_lock = threading.Lock()


def _ensure_model() -> SentenceTransformer:
    global _model
    if _model is None:
        logger.info(f"loading {MODEL_NAME}...")
        t0 = time.time()
        _model = SentenceTransformer(MODEL_NAME, device="cpu")
        logger.info(f"recall model loaded in {time.time() - t0:.1f}s")
    return _model


def _searchable_text(entry: dict) -> str:
    """Combine the fields a recall query should be able to match."""
    parts = [
        entry.get("response", ""),
        entry.get("user_correction") or "",
        entry.get("question", "") or "",
    ]
    return " ".join(p for p in parts if p).strip()


def refresh() -> int:
    """Reload JSONL files and re-compute all embeddings.

    Returns the number of entries indexed. Callable from the FastAPI
    startup hook (one-shot at boot) or `/admin/refresh-recall` (on
    demand when the JSONL grows during testing). Holds `_lock` so a
    concurrent /recall call doesn't see a half-built index.
    """
    global _entries, _embeddings
    with _lock:
        model = _ensure_model()
        entries: list[dict] = []
        for path in sorted(glob.glob(JSONL_GLOB)):
            with open(path) as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        d = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    text = _searchable_text(d)
                    # Skip placeholder rows (no real text or no real
                    # image) and rows with no searchable content.
                    if not text:
                        continue
                    if len(d.get("image_b64", "")) <= 100:
                        continue
                    entries.append(d)

        if not entries:
            _entries = []
            _embeddings = None
            logger.warning("no entries to index")
            return 0

        texts = [_searchable_text(e) for e in entries]
        embeddings = model.encode(
            texts, convert_to_numpy=True, normalize_embeddings=True
        )
        _entries = entries
        _embeddings = embeddings
        logger.info(f"indexed {len(entries)} entries")
        return len(entries)


def find_relevant(
    query_text: str,
    top_k: int = 1,
    min_similarity: float = 0.3,
) -> list[dict]:
    """Find past interactions relevant to `query_text`.

    Returns a list of `{entry, similarity, score}` dicts.
      - `similarity`: raw cosine, in [-1, 1]; for our normalized
        embeddings effectively in [0, 1]. Used for the
        `min_similarity` filter so we don't surface garbage matches.
      - `score`: similarity × recency-weight; used for ranking.
        Recency is `exp(-age_hours / RECENCY_HALFLIFE_HOURS)`, so
        rows older than ~2 days lose half their score, ~4 days a
        quarter, etc. Lets a slightly-less-similar but very recent
        memory beat a more-similar but week-old one.
    """
    with _lock:
        if _embeddings is None or len(_entries) == 0:
            return []

        model = _ensure_model()
        q_emb = model.encode(
            [query_text], convert_to_numpy=True, normalize_embeddings=True
        )[0]
        # Embeddings are unit-normalized → dot product == cosine.
        similarities = _embeddings @ q_emb

        now = datetime.now(UTC)
        scores: list[float] = []
        for sim, entry in zip(similarities, _entries, strict=True):
            try:
                ts = datetime.fromisoformat(entry["ts"])
                age_hours = (now - ts).total_seconds() / 3600
                recency = float(np.exp(-age_hours / RECENCY_HALFLIFE_HOURS))
            except Exception:
                recency = 0.5  # missing/bad ts: neutral fallback
            scores.append(float(sim) * recency)

        # Filter by raw similarity (not weighted score) so we don't
        # accept a barely-related but very recent row.
        candidates = [
            (i, scores[i])
            for i in range(len(scores))
            if similarities[i] >= min_similarity
        ]
        candidates.sort(key=lambda x: x[1], reverse=True)

        return [
            {
                "entry": _entries[i],
                "similarity": float(similarities[i]),
                "score": float(scores[i]),
            }
            for i, _ in candidates[:top_k]
        ]
