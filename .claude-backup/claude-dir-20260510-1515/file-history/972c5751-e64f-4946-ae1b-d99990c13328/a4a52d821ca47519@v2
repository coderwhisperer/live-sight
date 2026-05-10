"""Local Whisper inference for speech-to-text.

Loads `whisper-large-v3` once at startup, transcribes audio via
faster-whisper (CTranslate2 backend). Auto-detects language; handles
Roman Urdu / English code-switching well, which is what we need for
voice corrections in the upcoming UI work.

CPU/int8 path (not GPU): ctranslate2's pip wheel ships CUDA-only, and
this droplet is ROCm — `ctranslate2.get_cuda_device_count()` returns
0. CPU at large-v3/int8 sustains ~5× realtime on this CPU class,
which is fine for 5-30 second correction audio.

If we ever want GPU Whisper on ROCm: build CT2 from source against
ROCm or switch to transformers-Whisper running inside the rocm
container alongside vLLM. Not justified for v0.
"""

from __future__ import annotations

import io
import logging
import time

from faster_whisper import WhisperModel

logger = logging.getLogger("livesight.whisper")

WHISPER_MODEL_NAME = "large-v3"
WHISPER_DOWNLOAD_ROOT = "/shared-docker/models/whisper-large-v3"
WHISPER_DEVICE = "cpu"
WHISPER_COMPUTE_TYPE = "int8"

_model: WhisperModel | None = None


def _ensure_model() -> WhisperModel:
    """Load Whisper on first call; subsequent calls return the cached
    instance. Safe to call from a startup hook to pre-warm."""
    global _model
    if _model is None:
        logger.info(
            f"loading whisper {WHISPER_MODEL_NAME} "
            f"({WHISPER_DEVICE}/{WHISPER_COMPUTE_TYPE})..."
        )
        t0 = time.time()
        _model = WhisperModel(
            WHISPER_MODEL_NAME,
            device=WHISPER_DEVICE,
            compute_type=WHISPER_COMPUTE_TYPE,
            download_root=WHISPER_DOWNLOAD_ROOT,
        )
        logger.info(f"whisper loaded in {time.time() - t0:.1f}s")
    return _model


def transcribe(audio_bytes: bytes, language: str | None = None) -> dict:
    """Transcribe audio bytes (webm/mp3/wav/etc.). Returns transcript +
    detected language + duration + latency.

    This call is synchronous and CPU-bound. Async callers should wrap
    it in `asyncio.to_thread(...)` so a long transcription doesn't
    block the FastAPI event loop and stall other requests.
    """
    model = _ensure_model()
    t0 = time.time()
    segments, info = model.transcribe(
        io.BytesIO(audio_bytes),
        language=language,
        beam_size=5,
    )
    # `segments` is a generator — iterating it actually runs the model.
    transcript = " ".join(seg.text.strip() for seg in segments).strip()
    return {
        "transcript": transcript,
        "language": info.language,
        "language_probability": float(info.language_probability),
        "duration_s": float(info.duration),
        "latency_ms": int((time.time() - t0) * 1000),
    }
