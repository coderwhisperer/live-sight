# Backend — Python on AMD MI300X

## Environment

- AMD Developer Cloud, MI300X 1-GPU droplet (192GB VRAM, 20 vCPU, 240GB RAM)
- Quick-start image: vLLM 0.17.1 / ROCm 7.2.0 (vLLM pre-installed, no Docker)
- Python 3.11 (provided by image)
- Working directory: `/workspace/live-sight/`

## ROCm-specific gotchas

- `HIP_VISIBLE_DEVICES=0` is the AMD equivalent of `CUDA_VISIBLE_DEVICES`.
- `PYTORCH_ALLOC_CONF=expandable_segments:True` reduces OOM on long sessions.
- `torch.cuda.is_available()` returns True on ROCm — PyTorch's CUDA API
  is aliased to HIP. This is correct, do not "fix" it.
- vLLM CUDA-specific flags don't all work on ROCm. Check vLLM ROCm docs
  before using any flag not seen in AMD examples.
- bitsandbytes 4-bit quantization is unreliable on ROCm. Use FP16/BF16.

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

vLLM and the FastAPI server both run in tmux. See
`scripts/dev/start-services.sh` for the setup. Never run them as
foreground processes — they need to survive your SSH disconnect.
