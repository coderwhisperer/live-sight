# Droplet Setup State

Current state of the live droplet. Update this when:
- A service starts/stops
- A model is downloaded
- An adapter is trained
- The droplet is destroyed (note the destroy time)

## Last updated

2026-05-04 20:50 UTC — task 02 complete (FastAPI on host, external smoke test PASS).

## Droplet details

- Provider: AMD Developer Cloud
- Public IP: `129.212.179.191`
- Spec: MI300X 1-GPU, 192GB VRAM, 20 vCPU, 240GB RAM
- Image: AMD ROCm image that ships Docker container `rocm`
  (vLLM 0.17.1+rocm700, ROCm 7, Python 3.12)
- Container provisioned: 2026-05-04 19:19 UTC

## Services running

vLLM runs **inside container `rocm`**; FastAPI runs **on the host** and calls
vLLM via the published port at `localhost:8000`. Both started detached
(`docker exec -d` for vLLM, `nohup` for FastAPI) — see ADR in `decisions.md`.
Logs live at `/shared-docker/logs/`.

| Service | Where          | Port                   | Status                                                    | Log                                                                |
|---------|----------------|------------------------|-----------------------------------------------------------|--------------------------------------------------------------------|
| vLLM    | rocm container | 8000 (internal only)   | running (pid 177 in container)                            | `/shared-docker/logs/vllm.log`                                     |
| FastAPI | host           | 8001 (public)          | running (PID file `/shared-docker/logs/api.pid`)          | `/shared-docker/logs/api.log` + `/shared-docker/logs/api.stdout.log` |
| Training| rocm container | —                      | idle (no nightly job yet)                                 | —                                                                  |

vLLM args in use: `--served-model-name qwen2-vl --port 8000 --max-model-len 4096 --dtype bfloat16`,
with `HIP_VISIBLE_DEVICES=0` and `PYTORCH_ALLOC_CONF=expandable_segments:True`.

FastAPI: uvicorn bound `0.0.0.0:8001`, venv at `backend/.venv/`, started by
`backend/scripts/start-api.sh` (idempotent — won't double-start). Stop with
`backend/scripts/stop-api.sh`. Interaction logs append to
`/shared-docker/data/interactions/YYYY-MM-DD.jsonl`.

vLLM args in use: `--served-model-name qwen2-vl --port 8000 --max-model-len 4096 --dtype bfloat16`,
with `HIP_VISIBLE_DEVICES=0` and `PYTORCH_ALLOC_CONF=expandable_segments:True`.

GPU memory after vLLM warm: 186.6 GB used / 205.8 GB total (`rocm-smi --showmeminfo vram`).
That's ~91% — KV cache is sized to fill the GPU. Headroom for a LoRA adapter
will require either lower `--gpu-memory-utilization` or a smaller `--max-model-len`.

## Models on disk

| Path                                  | Model                       | Size | Notes                                      |
|---------------------------------------|-----------------------------|------|--------------------------------------------|
| `/shared-docker/models/qwen2-vl-7b/`  | Qwen/Qwen2-VL-7B-Instruct   | 16 G | 5 safetensor shards, downloaded 2026-05-04 |

## Adapters on disk

| Path | Version | Trained on | Loss | Notes |
|------|---------|-----------|------|-------|
| (none yet) | | | | |

## Pushed to HF

| Repo | Last sync | Notes |
|------|-----------|-------|
| (none yet) | | |
