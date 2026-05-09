# Backend — Python on AMD MI300X (Docker)

## Environment

- AMD MI300X host droplet (192GB VRAM, 20 vCPU, 240GB RAM).
- vLLM and PyTorch run **inside Docker container `rocm`**, not on the host.
- Image provides vLLM 0.17.1+rocm700, ROCm 7.x, Python 3.12.
- Container ports `8000`, `8888`, `30000` published to the host.
- `/shared-docker` is bind-mounted into the container at the **same path**,
  so files at `/shared-docker/live-sight/` are accessible at the same path
  inside the container — paths in code do not change between host and container.

### Where things live

| Thing                | Path (same on host and in container) |
|----------------------|--------------------------------------|
| Repo                 | `/shared-docker/live-sight/`         |
| Models               | `/shared-docker/models/`             |
| Logs (vllm, api)     | `/shared-docker/logs/`               |
| `.env` (HF_TOKEN…)   | `/shared-docker/live-sight/.env`     |

### Running commands in the container

```bash
docker exec rocm <cmd>              # one-shot
docker exec -it rocm bash           # interactive shell
docker exec -d rocm bash -c "..."   # detached / background process
docker logs -f rocm                 # container's main process (jupyter) logs
```

vLLM and the FastAPI server should be started **detached** with `docker exec -d`
and have their stdout/stderr redirected to files under `/shared-docker/logs/`.
That way they survive an SSH disconnect, the host shell exiting, and the
Claude Code session restarting — same guarantee tmux gave us, without the
ceremony of nested tmux-inside-docker.

## ROCm-specific gotchas

- `HIP_VISIBLE_DEVICES=0` is the AMD equivalent of `CUDA_VISIBLE_DEVICES`.
- `PYTORCH_ALLOC_CONF=expandable_segments:True` reduces OOM on long sessions.
- `torch.cuda.is_available()` returns True on ROCm — PyTorch's CUDA API
  is aliased to HIP. This is correct, do not "fix" it.
- vLLM CUDA-specific flags don't all work on ROCm. Check vLLM ROCm docs
  before using any flag not seen in AMD examples.
- bitsandbytes 4-bit quantization is unreliable on ROCm. Use FP16/BF16.
- vLLM on ROCm prints `WARNING ... [gpt_oss_triton_kernels_moe.py:56]
  Using legacy triton_kernels on ROCm` at every startup. It fires at
  *module import* in a fused-MoE kernel file, so it's harmless for our
  dense model (Qwen3-VL-8B) — the code path is never executed. If we
  ever swap in an MoE model (Mixtral, Qwen2-MoE, DeepSeek), re-evaluate:
  the legacy path may be slower or differ in numerics. A sibling
  `ERROR Failed to import Triton kernels` from the same file is **not**
  the same thing — that one means triton itself failed to import.

## Service layout

```
backend/
├── pyproject.toml
├── src/livesight/
│   ├── inference/
│   │   ├── server.py        # FastAPI app
│   │   ├── vllm_client.py   # thin wrapper over vLLM HTTP API
│   │   └── prompts.py       # mode system prompts
│   ├── personalize/
│   │   ├── train.py         # nightly LoRA training
│   │   ├── data.py          # interaction log → training pairs
│   │   └── swap.py          # adapter hot-swap
│   └── shared/
│       ├── config.py        # env vars in one place
│       └── logging.py       # structured logging
├── scripts/
│   ├── smoke-test.sh
│   └── start-vllm.sh
└── tests/
```

## API contract

Frontend calls these. Don't break without same-commit frontend update.

```
POST /describe
  { image_b64: string, mode: "navigate"|"read"|"scene" }
  → { description: string, latency_ms: number }

POST /query
  { question: string, recent_frames_b64?: string[] }
  → { answer: string, latency_ms: number }

POST /interaction-log
  { image_b64, mode, response, user_correction?: string }
  → { logged: true }

GET /health
  → { status: "ok", model: string, adapter_version: string }
```

## Performance targets (demo-day)

- /describe first-token: <500ms p95
- /describe full: <2s p95
- /query: <3s p95

If you can't hit these, reduce client-side image resolution to 768px
before optimizing the model.

## What to defer

- Auth (single-user demo)
- Database (interaction log = JSONL on disk)
- Multi-tenant adapters
- Streaming responses (only if time permits Day 4-5)

## Running services

Split intentionally:

- **vLLM** runs **inside the `rocm` container**, started with `docker exec -d`,
  logging to `/shared-docker/logs/vllm.log`. Smoke test from host hits
  `http://localhost:8000` via the published port.
- **FastAPI** runs **on the host**, started with `nohup`, PID at
  `/shared-docker/logs/api.pid`, logs at `/shared-docker/logs/api.log` and
  `/shared-docker/logs/api.stdout.log`. It calls vLLM at `http://localhost:8000`
  (the published Docker port) and binds `0.0.0.0:8001` for the HF Space
  frontend to reach it.

Why split: keeps Python web deps (FastAPI, httpx, pillow) off the GPU
container; lets us edit and restart FastAPI without `docker exec` round-trips.
Network-wise it's free — host→container localhost goes through `docker-proxy`
on `lo`, no NAT hop.

## LoRA training

Training **runs inside the `rocm` container**, not in the host venv. Same
pattern as vLLM: container has the GPU stack (torch 2.9.1+HIP 7.0,
transformers, peft, accelerate, datasets), host has only the web stack.
Source lives at `backend/src/livesight/training/train_lora.py` (so it's
tracked in git and accessible inside the container via the bind mount).
Wrapper at `backend/scripts/train-lora.sh`.

Training and serving are mutually exclusive on the GPU — vLLM's KV cache
fills ~91% of the 192GB by default, leaving no room for training. The
wrapper stops vLLM, runs training in the container, then restarts vLLM.
Total `/health` downtime is the training run + ~30s vLLM warmup.

Where things land:
- adapters → `/shared-docker/adapters/<name>/` (only adapter files)
- trainer scratch (logs, intermediate checkpoints if save_strategy is on)
  → `/shared-docker/training-runs/<name>-checkpoints/` (sibling tree)

## Adapter hot-swap

vLLM serves the base model AND any number of LoRA adapters under distinct
names. Routing is decided per request by the `model` field on the chat
completion call. FastAPI tracks which adapter is "active" via a small
singleton.

**vLLM startup flags** (set in `provision.sh` and `train-lora.sh`):
- `--enable-lora` — top-level switch
- `--max-loras 2` — adapters loaded simultaneously; 2 lets us preload
  v1 alongside v0 for swap demos
- `--max-lora-rank 16` — must be ≥ our adapter's rank (we train at 16)
- `VLLM_ALLOW_RUNTIME_LORA_UPDATING=True` (env, not flag) — exposes
  `POST /v1/load_lora_adapter`. **Necessary in addition to `--enable-lora`**;
  without it the load endpoint 404s. Discovered the hard way during task
  09 — see `docs/wiki/gotchas.md`.

**`AdapterState`** (`backend/src/livesight/inference/adapter_state.py`):
A frozen dataclass `(active, version)` behind a `Lock`. `active` is the
vLLM model name we send (`"qwen2-vl"` or `"livesight-v0"` etc.);
`version` is the human label `/health` reports (`"base"`, `"v0"`, …).
Read on every inference call, written only by the swap endpoint.

**`/admin/swap-adapter` contract** (POST, JSON body):
```
{ adapter_path: string|null, adapter_name: string, version: string }
```
- `adapter_path != null`: POST to vLLM's `/v1/load_lora_adapter` with
  `(name, path)`. vLLM returning "already loaded" is treated as a no-op
  (idempotent). Then `set_active(adapter_name, version)`.
- `adapter_path == null`: skip the vLLM call, just update `AdapterState`.
  Used to swap back to the base model.

Returns `{ active, version, loaded_into_vllm: bool }`. The endpoint is
*not* authenticated — for v0 we accept that anyone who can reach 8001
can swap. Tighten before public submission.

**`backend/scripts/swap-adapter.sh`**: thin curl wrapper.
- `swap-adapter.sh /path/to/adapter` — load by basename
- `swap-adapter.sh /path adapter-name version-label` — explicit
- `swap-adapter.sh --base` — route back to base, no vLLM call

Race condition note: a `/describe` in-flight when a swap happens uses
whichever adapter was active at request start. Acceptable for v0
(single user, demo context).

## STT (Whisper)

`POST /transcribe` accepts a multipart audio upload, returns
`{transcript, language, language_probability, duration_s, latency_ms}`.
Auto-detects language; supports Roman Urdu / English code-switching
(the actual demo language).

Implementation: faster-whisper (CTranslate2 backend) running
`whisper-large-v3` on CPU at int8 quantization. Model lives at
`/shared-docker/models/whisper-large-v3/` (~2.9 GB on disk). Loaded once
at FastAPI startup via the `warm_whisper` lifespan hook
(~3.6s warm-up). The endpoint dispatches to `asyncio.to_thread` so a
long transcription doesn't block the event loop and stall concurrent
`/describe`/`/query` calls.

**CPU, not GPU**: ctranslate2's pip wheels are CUDA-only and report
0 visible devices on this ROCm host. Building CT2 from source against
ROCm is a multi-hour project we've deferred indefinitely; for v0,
CPU/int8 is sufficient. See `docs/wiki/decisions.md` and
`docs/wiki/gotchas.md` for the full reasoning.

**Latency expectation**: ~0.5× realtime on this CPU (4s audio →
~8s transcription). Acceptable for one-off voice corrections (5–30s
audio → 10–60s wait). If we ever need real-time STT, the path is
either GPU CT2 (build-from-source) or transformers-Whisper inside
the rocm container alongside vLLM.

**Memory**: ~2.4 GB host RSS after warm-up (~2 GB of which is the
model). Host has 235 GB total — no headroom concern.
