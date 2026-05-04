# Droplet Setup State

Current state of the live droplet. Update this when:
- A service starts/stops
- A model is downloaded
- An adapter is trained
- The droplet is destroyed (note the destroy time)

## Last updated

2026-05-04 19:59 UTC — task 01 complete (vLLM serving, smoke test PASS).

## Droplet details

- Provider: AMD Developer Cloud
- Public IP: `129.212.179.191`
- Spec: MI300X 1-GPU, 192GB VRAM, 20 vCPU, 240GB RAM
- Image: AMD ROCm image that ships Docker container `rocm`
  (vLLM 0.17.1+rocm700, ROCm 7, Python 3.12)
- Container provisioned: 2026-05-04 19:19 UTC

## Services running

vLLM and (planned) FastAPI run **inside container `rocm`**, started detached
with `docker exec -d`. No host tmux. Logs live at `/shared-docker/logs/`.

| Service | Where         | Port (container → host) | Status                              | Log                              |
|---------|---------------|--------------------------|-------------------------------------|----------------------------------|
| vLLM    | rocm container| 8000 → 8000              | running (pid 177 in container)      | `/shared-docker/logs/vllm.log`   |
| FastAPI | rocm container| 8001 → 8001 (planned)    | not started (task 02)               | `/shared-docker/logs/api.log`    |
| Training| rocm container| —                        | idle (no nightly job yet)           | —                                |

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
