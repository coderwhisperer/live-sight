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
- vLLM on ROCm prints `WARNING ... Using legacy triton_kernels on ROCm` at
  startup — that is normal, not a problem.

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

Both vLLM and the FastAPI server run **inside the `rocm` container**, started
with `docker exec -d` and logging to `/shared-docker/logs/`. The smoke test
runs from the host and hits `http://localhost:8000` because the container
publishes port 8000 to the host. See `backend/scripts/start-vllm.sh`.
