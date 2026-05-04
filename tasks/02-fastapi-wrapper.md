# Task 02 — FastAPI Wrapper Around vLLM

## Goal

Build a FastAPI server **on the host** that exposes the four endpoints from
`docs/architecture.md`, calling vLLM at `localhost:8000` (the published
Docker port). By end of task, the frontend (or curl from your laptop) can
POST an image to the public endpoint and get back a description.

## Architecture decision (locked)

FastAPI runs on the **host**, not inside the `rocm` container.

- Host can reach vLLM via `http://localhost:8000` because the rocm container
  publishes that port.
- FastAPI binds `0.0.0.0:8001`. The DOCKER-USER iptables chain leaves 8001
  alone (no DROP rule), so the port is publicly reachable — which is what
  the HF Space frontend needs.
- This keeps Python deps (FastAPI, httpx, pillow) off the GPU container,
  and lets Claude Code edit files at native speed without `docker exec`.

## Acceptance criteria

1. FastAPI server runs on host, port 8001, started via a script that
   survives SSH disconnect (nohup + log file is sufficient; systemd is
   overkill for a hackathon).
2. Four endpoints implemented: `/health`, `/describe`, `/query`,
   `/interaction-log`. Contracts match `docs/architecture.md` exactly.
3. CORS configured to allow the eventual HF Space origin (use `*` for now;
   tighten before submission).
4. Image resizing happens server-side as a defense — accept any reasonable
   size client-side, resize to max 768px on the longest dimension before
   passing to vLLM.
5. Latency logging — every request logs method, path, status, and ms to
   `/shared-docker/logs/api.log`. **Never log image bytes.**
6. Host smoke test passes (Claude Code runs this).
7. External smoke test passes (you run this from your laptop, between
   steps 8 and 10).
8. Interaction log writes to
   `/shared-docker/data/interactions/YYYY-MM-DD.jsonl` (one file per day,
   append-only).
9. Wiki updated: `setup-state.md` notes FastAPI is running with PID file
   path; `iteration-log.md` has the timing measurements from smoke tests.

## Not in scope (defer)

- Authentication on `/describe` and `/query`. Single-user demo for now;
  add before public submission.
- Streaming responses. Nice-to-have if time permits Day 4-5.
- Mode-aware system prompts (navigate/read/scene). That's task 03.
- LoRA adapter integration. That's task 04.

## Steps

### 1. Project structure

Create the backend Python project layout:

```
backend/
├── pyproject.toml
├── src/livesight/
│   ├── __init__.py
│   ├── inference/
│   │   ├── __init__.py
│   │   ├── server.py        # FastAPI app, route handlers, middleware
│   │   ├── vllm_client.py   # async wrapper over vLLM HTTP API
│   │   └── prompts.py       # placeholder generic prompt (modes come task 03)
│   └── shared/
│       ├── __init__.py
│       ├── config.py        # env var loading, paths
│       └── logging.py       # structured logging setup
├── scripts/
│   ├── start-api.sh
│   ├── stop-api.sh
│   └── smoke-test-api.sh
└── tests/
    └── test_server.py       # one happy-path test, not a full suite
```

### 2. Dependencies

Use `pyproject.toml` (modern Python packaging — no `setup.py`, no
`requirements.txt`). Pin to permissive ranges:

- fastapi
- uvicorn[standard]
- httpx (async HTTP client to vLLM)
- pillow (image resize)
- python-multipart (in case form uploads are added later)
- python-dotenv

Use `uv` if available (fast), else `pip` with a venv. Total install
should be <60 seconds.

Install location: a venv at `backend/.venv/`. Gitignored.

### 3. The vLLM client (`vllm_client.py`)

Async wrapper over vLLM's OpenAI-compatible chat completions endpoint.

Single primary function:

```python
async def describe_image(image_b64: str, prompt: str) -> str:
    """Call vLLM with an image + text prompt, return the response text."""
```

Implementation notes:
- POSTs to `http://localhost:8000/v1/chat/completions`
- Builds the multimodal message structure (content array with image_url +
  text parts, exactly like the smoke test in task 01)
- Uses `qwen2-vl` as the model name (matches vLLM's `--served-model-name`)
- httpx async client, 30-second hard timeout
- No retries — let the caller decide

### 4. The FastAPI app (`server.py`)

Pydantic models for request/response, matching `docs/architecture.md`:

```python
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
```

Endpoint behaviors:

**`POST /describe`**
- Decode the base64 image
- Resize to max 768px on the longest dimension using PIL
- Re-encode to base64 (JPEG, quality 85)
- Call `vllm_client.describe_image()` with a generic prompt (modes ignored
  for now — task 03 wires them in)
- Measure end-to-end latency
- Return description + latency_ms

**`POST /query`**
- Same path as /describe but with a question-style prompt
- If `recent_frames_b64` is provided, include the most recent frame as
  the image context (multi-frame is a task 03+ concern)
- Return answer + latency_ms

**`POST /interaction-log`**
- Append the full payload (including image_b64) to today's JSONL file
- File path: `/shared-docker/data/interactions/YYYY-MM-DD.jsonl`
- Strip image_b64 from any log lines that go to api.log
- Return `{logged: true}`

**`GET /health`**
- Make a 5-second-timeout GET to `http://localhost:8000/v1/models`
- Return `{status: "ok", model: "qwen2-vl", adapter_version: "v0"}` if vLLM
  responds. `adapter_version` is hardcoded "v0" until task 04.
- Return 503 with `status: "vllm_unreachable"` if vLLM doesn't respond.

### 5. Logging middleware

A FastAPI middleware that:
- Times every request from receipt to response
- Logs `{timestamp, method, path, status, latency_ms}` as JSON to
  `/shared-docker/logs/api.log`
- **Never includes request body, response body, or image bytes**

Use Python's `logging` module with a JSON formatter. Rotate at 100MB to
prevent runaway log files.

### 6. CORS configuration

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # tighten before submission
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
```

A code comment should mark this as needing tightening before submission
(restrict to the HF Space origin).

### 7. Start/stop scripts

`scripts/start-api.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

cd /shared-docker/live-sight/backend

# Activate venv if present
if [[ -d .venv ]]; then
  source .venv/bin/activate
fi

mkdir -p /shared-docker/logs /shared-docker/data/interactions

# Idempotent: don't start if already running
if [[ -f /shared-docker/logs/api.pid ]] && \
   kill -0 "$(cat /shared-docker/logs/api.pid)" 2>/dev/null; then
  echo "API already running (PID $(cat /shared-docker/logs/api.pid))"
  exit 0
fi

nohup uvicorn livesight.inference.server:app \
  --host 0.0.0.0 --port 8001 \
  > /shared-docker/logs/api.stdout.log 2>&1 &

echo $! > /shared-docker/logs/api.pid
echo "API started with PID $(cat /shared-docker/logs/api.pid)"

# Wait briefly and verify it's actually listening
sleep 2
if curl -sf http://localhost:8001/health > /dev/null 2>&1; then
  echo "API responding to /health"
else
  echo "WARN: API started but /health not responding yet (may still be initializing)"
fi
```

`scripts/stop-api.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

if [[ -f /shared-docker/logs/api.pid ]]; then
  PID=$(cat /shared-docker/logs/api.pid)
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "Stopped API (PID $PID)"
  else
    echo "PID file exists but process $PID is not running"
  fi
  rm -f /shared-docker/logs/api.pid
else
  echo "No PID file at /shared-docker/logs/api.pid"
fi
```

Both scripts must be executable (`chmod +x`).

### 8. Host-side smoke test

`scripts/smoke-test-api.sh`:
- Pull the same Unsplash test image as task 01's smoke test
- POST to `http://localhost:8001/describe` with mode=scene
- Assert response contains a non-empty description
- POST to `http://localhost:8001/health`, assert status=ok
- Print results, exit 0/1

Run from the host:
```bash
./backend/scripts/smoke-test-api.sh
```

Expected output:
```
PASS /health: model=qwen2-vl adapter_version=v0
PASS /describe: <description text>
Latency: <N>ms
```

### 9. STOP HERE — wait for external smoke test

After step 8 passes, **stop and report to the user**. They will run the
external smoke test from their laptop:

```bash
# User runs this from their laptop:
curl -X POST http://<droplet-ip>:8001/describe \
  -H "Content-Type: application/json" \
  -d '{"image_b64": "<base64>", "mode": "scene"}'
```

If that returns a sensible description, the user will confirm and you
proceed to step 10. If it times out or fails, debug before continuing.

Common external-test failure modes:
- Port 8001 blocked by DOCKER-USER iptables chain (it shouldn't be — task 01
  established that the AMD image only blocks 8000)
- FastAPI bound to 127.0.0.1 instead of 0.0.0.0 (check uvicorn flags)
- ufw blocking 8001 (check `ufw status` — unlikely on this image)

### 10. Wiki update

After external smoke test passes:

`setup-state.md`:
- Add row to services table: `api | FastAPI | 8001 | running, PID at /shared-docker/logs/api.pid`
- Note the venv location: `backend/.venv/`

`iteration-log.md`:
- Append entry with cold-start latency (first request) and warm latency
  (subsequent 5 requests, take the median)
- Note any surprises encountered

`gotchas.md`:
- If anything non-obvious came up, document it here

## When you finish

Commit and push to GitHub:

```bash
git add backend/ tasks/02-fastapi-wrapper.md docs/wiki/
git commit -m "feat: FastAPI wrapper with /describe, /query, /interaction-log, /health"
git push origin develop
```

Stop and report. Next task: 03-mode-aware-prompts.

## If something fails

- vLLM unreachable from FastAPI: confirm `curl http://localhost:8000/v1/models`
  works from the host. The container's port mapping should make this work.
- 502/504 from FastAPI to vLLM: temporarily increase httpx timeout to 60s
  and check vLLM logs (`/shared-docker/logs/vllm.log`) for OOM or stalls.
- Latency >2s on a warm GPU: image resize step is likely wrong. Confirm
  the image being sent to vLLM is ≤768px on its longest dimension.
- CORS error from external test: check the middleware is registered
  before the route definitions.
- Port 8001 unreachable from laptop but reachable from droplet host:
  check DOCKER-USER chain (`iptables -L DOCKER-USER -n -v`) and ufw.
  Should be neither blocking 8001 by default.

If something fails not on this list: stop, don't improvise, ask the user.