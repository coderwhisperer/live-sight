import asyncio
import base64
import io
import json
import os
import time
from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

import httpx
from fastapi import FastAPI, File, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image
from pydantic import BaseModel

from livesight.inference import vllm_client, whisper_client
from livesight.inference.adapter_state import get_active, set_active
from livesight.inference.prompts import (
    QUERY_MAX_TOKENS,
    QUERY_SYSTEM_PROMPT,
    max_tokens_for,
    user_prompt_for,
)
from livesight.shared.config import (
    DATA_DIR,
    JPEG_QUALITY,
    MAX_IMAGE_DIM,
    VLLM_HEALTH_TIMEOUT_S,
    VLLM_URL,
)
from livesight.shared.logging import configure_logging

logger = configure_logging()

app = FastAPI(title="Live Sight backend", version="0.1.0")

# TODO before submission: tighten allow_origins to the HF Space origin only.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    latency_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "request",
        extra={
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "latency_ms": latency_ms,
        },
    )
    return response


class DescribeRequest(BaseModel):
    image_b64: str
    mode: Literal["navigate", "read", "scene"]


class DescribeResponse(BaseModel):
    description: str
    latency_ms: int


class QueryRequest(BaseModel):
    image_b64: str
    question: str


class QueryResponse(BaseModel):
    response: str
    latency_ms: int


class InteractionLogRequest(BaseModel):
    image_b64: str
    mode: str
    response: str
    user_correction: str | None = None
    # Populated only for ask-mode entries (logged from /query). Other
    # modes leave it null so the JSONL row schema stays unified —
    # `mode == "ask"` is the discriminator at read time.
    question: str | None = None


class InteractionLogResponse(BaseModel):
    logged: bool
    id: str


class CorrectionUpdateRequest(BaseModel):
    user_correction: str


class CorrectionUpdateResponse(BaseModel):
    ok: bool
    id: str


class HealthResponse(BaseModel):
    status: str
    model: str
    adapter_version: str


class SwapAdapterRequest(BaseModel):
    # adapter_path null + adapter_name="qwen2-vl" → swap back to base model.
    adapter_path: str | None = None
    adapter_name: str
    version: str


class SwapAdapterResponse(BaseModel):
    active: str
    version: str
    loaded_into_vllm: bool


def _resize_to_max_dim(image_b64: str) -> str:
    raw = base64.b64decode(image_b64)
    img = Image.open(io.BytesIO(raw))
    if img.mode != "RGB":
        img = img.convert("RGB")
    longest = max(img.size)
    if longest > MAX_IMAGE_DIM:
        scale = MAX_IMAGE_DIM / longest
        new_size = (int(img.size[0] * scale), int(img.size[1] * scale))
        img = img.resize(new_size, Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=JPEG_QUALITY)
    return base64.b64encode(buf.getvalue()).decode("ascii")


@app.get("/health", response_model=HealthResponse)
async def health():
    state = get_active()
    try:
        async with httpx.AsyncClient(timeout=VLLM_HEALTH_TIMEOUT_S) as client:
            resp = await client.get(f"{VLLM_URL}/v1/models")
            resp.raise_for_status()
    except httpx.HTTPError:
        return JSONResponse(
            status_code=503,
            content={
                "status": "vllm_unreachable",
                "model": state.active,
                "adapter_version": state.version,
            },
        )
    return HealthResponse(
        status="ok", model=state.active, adapter_version=state.version
    )


@app.post("/admin/swap-adapter", response_model=SwapAdapterResponse)
async def swap_adapter(req: SwapAdapterRequest):
    """Load a LoRA adapter into vLLM and route /describe to it.

    Three flows:
      1. New adapter: req.adapter_path is set. POST /v1/load_lora_adapter,
         then update AdapterState.
      2. Already-loaded adapter: req.adapter_path is set but vLLM already
         has this adapter_name. The load call returns a "already exists"
         message; we still update AdapterState. Idempotent.
      3. Swap back to base: req.adapter_path is null and req.adapter_name
         is the base alias. Just update AdapterState — no vLLM call.

    Localhost-only is enforced by binding uvicorn to 0.0.0.0:8001 with
    no auth in front; for v0 we accept that anyone who can reach 8001
    can swap. Tighten before public submission (auth or bind to lo).
    """
    loaded = False
    if req.adapter_path is not None:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{VLLM_URL}/v1/load_lora_adapter",
                json={
                    "lora_name": req.adapter_name,
                    "lora_path": req.adapter_path,
                },
            )
            if resp.status_code == 200:
                loaded = True
            elif resp.status_code == 400 and "already" in resp.text.lower():
                # vLLM returns 400 if the name is already loaded. Treat
                # that as a no-op so swap-adapter is idempotent.
                loaded = True
            else:
                return JSONResponse(
                    status_code=502,
                    content={
                        "error": "vllm_load_failed",
                        "vllm_status": resp.status_code,
                        "vllm_body": resp.text[:500],
                    },
                )
    state = set_active(active=req.adapter_name, version=req.version)
    return SwapAdapterResponse(
        active=state.active, version=state.version, loaded_into_vllm=loaded
    )


@app.post("/describe", response_model=DescribeResponse)
async def describe(req: DescribeRequest):
    started = time.perf_counter()
    resized = _resize_to_max_dim(req.image_b64)
    description = await vllm_client.describe_image(
        image_b64=resized,
        user_prompt=user_prompt_for(req.mode),
        max_tokens=max_tokens_for(req.mode),
    )
    latency_ms = int((time.perf_counter() - started) * 1000)
    return DescribeResponse(description=description.strip(), latency_ms=latency_ms)


@app.post("/query", response_model=QueryResponse)
async def query(req: QueryRequest):
    """Voice/text question + image → focused answer.

    Builds a proper [system, user(image+text)] message split for vLLM.
    The system message frames assistant behavior; the user message
    contains the literal question text alongside the image. This is
    materially different from /describe, which uses a single user
    message with a mode-specific instruction.

    On success, also writes an interaction-log entry with mode="ask"
    and the question populated, so corrections can later be PATCH-ed
    onto the row by id (same flow as /describe-mode entries the
    frontend logs).
    """
    started = time.perf_counter()
    resized = _resize_to_max_dim(req.image_b64)
    response_text = await vllm_client.describe_image(
        image_b64=resized,
        user_prompt=req.question,
        system_prompt=QUERY_SYSTEM_PROMPT,
        max_tokens=QUERY_MAX_TOKENS,
    )
    answer = response_text.strip()
    latency_ms = int((time.perf_counter() - started) * 1000)

    # Auto-log to JSONL. We call the interaction_log handler in-process
    # (not over HTTP) so we share its uuid + atomic-write logic without
    # round-tripping. Failure to log is non-fatal — the user got their
    # answer, we just lose the row in interactions.jsonl.
    try:
        await interaction_log(
            InteractionLogRequest(
                image_b64=req.image_b64,
                mode="ask",
                response=answer,
                user_correction=None,
                question=req.question,
            )
        )
    except Exception:  # noqa: BLE001
        logger.exception(
            "ask-mode interaction-log failed",
            extra={"event": "ask_log_failed"},
        )

    return QueryResponse(response=answer, latency_ms=latency_ms)


@app.post("/interaction-log", response_model=InteractionLogResponse)
async def interaction_log(req: InteractionLogRequest):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    path = DATA_DIR / f"{today}.jsonl"
    record_id = str(uuid4())
    record = req.model_dump() | {
        "id": record_id,
        "ts": datetime.now(UTC).isoformat(),
    }
    with path.open("a") as f:
        f.write(json.dumps(record) + "\n")
    return InteractionLogResponse(logged=True, id=record_id)


@app.patch(
    "/interaction-log/{record_id}", response_model=CorrectionUpdateResponse
)
async def update_interaction(record_id: str, req: CorrectionUpdateRequest):
    """Attach a user_correction to a previously-logged interaction.

    Looks for the row in today's JSONL first, then any older daily file
    (correction may arrive after midnight UTC). Atomic per-file rewrite
    via a temp file + os.replace; safe against process death mid-write.
    Single-user demo — does not lock against concurrent appends. If the
    nightly LoRA job ever runs while corrections are still streaming in,
    it should snapshot the file before reading.
    """
    if not DATA_DIR.exists():
        return JSONResponse(
            status_code=404, content={"error": "no interactions logged"}
        )

    today = datetime.now(UTC).strftime("%Y-%m-%d")
    today_path = DATA_DIR / f"{today}.jsonl"
    candidates: list = [today_path] if today_path.exists() else []
    for p in sorted(DATA_DIR.glob("*.jsonl"), reverse=True):
        if p not in candidates:
            candidates.append(p)

    for path in candidates:
        with path.open("r") as f:
            lines = f.readlines()
        new_lines: list[str] = []
        updated = False
        for raw in lines:
            line = raw.rstrip("\n")
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                new_lines.append(line)
                continue
            if rec.get("id") == record_id:
                rec["user_correction"] = req.user_correction
                rec["correction_ts"] = datetime.now(UTC).isoformat()
                updated = True
            new_lines.append(json.dumps(rec))
        if updated:
            tmp = path.with_suffix(".jsonl.tmp")
            with tmp.open("w") as f:
                f.write("\n".join(new_lines) + "\n")
            os.replace(tmp, path)
            return CorrectionUpdateResponse(ok=True, id=record_id)

    return JSONResponse(
        status_code=404,
        content={"error": f"no interaction with id {record_id}"},
    )


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    """Speech-to-text via local faster-whisper (large-v3, CPU/int8).

    Accepts any audio container ffmpeg can read (webm, wav, mp3, m4a…).
    Auto-detects language; supports Roman Urdu / English code-switching
    which is what the upcoming voice-correction UI needs.

    Whisper transcription is CPU-bound and can run ~1-6s for typical
    correction-length audio. We dispatch to a thread so concurrent
    /describe and /query calls aren't blocked.
    """
    audio_bytes = await audio.read()
    try:
        result = await asyncio.to_thread(whisper_client.transcribe, audio_bytes)
        return result
    except Exception as e:  # noqa: BLE001
        logger.exception("transcribe failed", extra={"event": "transcribe_error"})
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.on_event("startup")
async def warm_whisper():
    """Pre-load Whisper so the first /transcribe call doesn't pay the
    ~10-30s model-load cost. Failure here is non-fatal — STT is an
    optional feature; we let FastAPI keep serving /describe etc."""
    try:
        await asyncio.to_thread(whisper_client._ensure_model)
    except Exception as e:  # noqa: BLE001
        logger.warning(
            f"whisper pre-load failed: {e}",
            extra={"event": "whisper_warmup_failed"},
        )
