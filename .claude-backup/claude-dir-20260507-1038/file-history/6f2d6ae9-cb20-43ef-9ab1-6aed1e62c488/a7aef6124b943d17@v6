import base64
import io
import json
import time
from datetime import UTC, datetime
from typing import Literal

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image
from pydantic import BaseModel

from livesight.inference import vllm_client
from livesight.inference.adapter_state import get_active, set_active
from livesight.inference.prompts import (
    max_tokens_for,
    query_prompt,
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
    allow_methods=["GET", "POST"],
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
    question: str
    recent_frames_b64: list[str] | None = None


class QueryResponse(BaseModel):
    answer: str
    latency_ms: int


class InteractionLogRequest(BaseModel):
    image_b64: str
    mode: str
    response: str
    user_correction: str | None = None


class InteractionLogResponse(BaseModel):
    logged: bool


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
    started = time.perf_counter()
    if not req.recent_frames_b64:
        return JSONResponse(
            status_code=400,
            content={"error": "recent_frames_b64 must contain at least one frame"},
        )
    resized = _resize_to_max_dim(req.recent_frames_b64[-1])
    answer = await vllm_client.describe_image(
        image_b64=resized,
        user_prompt=query_prompt(req.question),
    )
    latency_ms = int((time.perf_counter() - started) * 1000)
    return QueryResponse(answer=answer.strip(), latency_ms=latency_ms)


@app.post("/interaction-log", response_model=InteractionLogResponse)
async def interaction_log(req: InteractionLogRequest):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    path = DATA_DIR / f"{today}.jsonl"
    record = req.model_dump() | {"ts": datetime.now(UTC).isoformat()}
    with path.open("a") as f:
        f.write(json.dumps(record) + "\n")
    return InteractionLogResponse(logged=True)
