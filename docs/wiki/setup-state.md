# Droplet Setup State

Current state of the live droplet. Update this when:
- A service starts/stops
- A model is downloaded
- An adapter is trained
- The droplet is destroyed (note the destroy time)

## Last updated

2026-05-06 — droplet `165.245.142.107` brought up via the recovery
playbook below (clone → `restore-claude.sh` → `provision.sh`). End-to-end
worked: model downloaded fresh in ~42s, vLLM started, FastAPI started,
smoke test passed with a sensible Qwen3-VL kitchen description. First
real test of the recovery playbook — found nothing broken.

History: 2026-05-05 `165.245.141.6` (destroyed); 2026-05-04 `129.212.179.191`
(destroyed for the break).

## Droplet details

- Provider: AMD Developer Cloud
- Public IP: `165.245.142.107` (previous: `165.245.141.6`, `129.212.179.191`)
- Spec: MI300X 1-GPU, 192GB VRAM, 20 vCPU, 240GB RAM
- Image: AMD ROCm image that ships Docker container `rocm`
  (vLLM 0.17.1+rocm700, ROCm 7, Python 3.12)
- Container provisioned: 2026-05-06 (per `docker inspect rocm`)

## Services running

vLLM runs **inside container `rocm`**; FastAPI runs **on the host** and calls
vLLM via the published port at `localhost:8000`. Both started detached
(`docker exec -d` for vLLM, `nohup` for FastAPI) — see ADR in `decisions.md`.
Logs live at `/shared-docker/logs/`.

| Service | Where          | Port                   | Status                                                       | Log                                                                |
|---------|----------------|------------------------|--------------------------------------------------------------|--------------------------------------------------------------------|
| vLLM    | rocm container | 8000 (internal only)   | running (pid 95 in container, started by provision.sh)      | `/shared-docker/logs/vllm.log`                                     |
| FastAPI | host           | 8001 (public)          | running (host PID at `/shared-docker/logs/api.pid`, was 286369)| `/shared-docker/logs/api.log` + `/shared-docker/logs/api.stdout.log` |
| Training| rocm container | —                      | idle (no nightly job yet)                                    | —                                                                  |

vLLM args in use: `vllm serve /shared-docker/models/qwen3-vl-8b --served-model-name qwen2-vl --port 8000 --max-model-len 4096 --dtype bfloat16 --enable-lora --max-loras 2 --max-lora-rank 16`,
with env `HIP_VISIBLE_DEVICES=0`, `PYTORCH_ALLOC_CONF=expandable_segments:True`,
and **`VLLM_ALLOW_RUNTIME_LORA_UPDATING=True`** (the env var is the second
half of the LoRA-loading switch — `--enable-lora` alone leaves the load
endpoint 404; see gotchas.md).

`/v1/models` lists both the base alias `qwen2-vl` and any loaded adapters
(currently `livesight-v0`). FastAPI routes per-request by reading the
active adapter name from `AdapterState`; `/health` reports the live
state, not a hardcoded label.

FastAPI: uvicorn bound `0.0.0.0:8001`, venv at `backend/.venv/`, started by
`backend/scripts/start-api.sh` (idempotent — won't double-start). Stop with
`backend/scripts/stop-api.sh`. Interaction logs append to
`/shared-docker/data/interactions/YYYY-MM-DD.jsonl`.

GPU memory after vLLM warm: 186.6 GB used / 205.8 GB total (`rocm-smi --showmeminfo vram`).
That's ~91% — KV cache is sized to fill the GPU. Headroom for a LoRA adapter
will require either lower `--gpu-memory-utilization` or a smaller `--max-model-len`.

## Models on disk

| Path                                  | Model                       | Size | Notes                                                                                       |
|---------------------------------------|-----------------------------|------|---------------------------------------------------------------------------------------------|
| `/shared-docker/models/qwen3-vl-8b/`  | Qwen/Qwen3-VL-8B-Instruct   | 17 G | **Active** — being served by vLLM. Downloaded fresh by `provision.sh` on 2026-05-06. |

vLLM serves the active model under the historical alias `qwen2-vl` so the
FastAPI client doesn't need to change. Underlying weights are 3-VL.

The previous droplet (`165.245.141.6`) had Qwen2-VL-7B on disk too as
leftover from the task 06 A/B; not present here since fresh droplets
only download Qwen3-VL via `provision.sh`.

## Fresh droplet recovery playbook

Verified end-to-end on the 2026-05-06 destroy/recreate cycle. Assumes the
new droplet was provisioned from the AMD ROCm image (container `rocm`
running, `/shared-docker` bind-mounted) and that you have your GitHub PAT
and HF_TOKEN handy.

```bash
# 1. Clone the repo onto the bind mount.
#    Replace <gh-pat> with a GitHub PAT that has read access to coderwhisperer/live-sight.
mkdir -p /shared-docker && cd /shared-docker && \
  git clone https://<gh-pat>@github.com/coderwhisperer/live-sight.git

# 2. Restore the .env file (HF_TOKEN at minimum, ELEVENLABS_API_KEY optional).
#    The .env is gitignored so the secret never lives in the repo — paste it manually.
cat > /shared-docker/live-sight/.env <<'EOF'
HF_TOKEN=hf_xxx
ELEVENLABS_API_KEY=
EOF
chmod 600 /shared-docker/live-sight/.env

# 3. Restore Claude Code state from the latest backup committed by the
#    previous droplet's destroy-safely.sh run. Optional — only do this if
#    you want continuity of conversation history. Skip on a clean start.
cd /shared-docker/live-sight && ./scripts/dev/restore-claude.sh

# 4. Run provision — handles the model download, venv, vLLM start, FastAPI start, and smoke test.
#    First run takes ~15 min if HF cache is cold (~42s on the 2026-05-06 cycle); ~1 min on a re-provision.
cd /shared-docker/live-sight && ./scripts/dev/provision.sh
```

After provision exits cleanly (last line: `Droplet is in the state described
in docs/wiki/setup-state.md.`), update the **Last updated** and **Public IP**
fields above. Run `backend/scripts/smoke-test-api.sh` from your laptop using
the new public IP to confirm external reachability.

Before destroying, run `scripts/dev/destroy-safely.sh` from the host to push
any uncommitted state to GitHub, snapshot Claude Code state into the repo,
and push adapters/data to HF.

## Adapters on disk

| Path | Version | Trained on | Loss | Notes |
|------|---------|-----------|------|-------|
| `/shared-docker/adapters/v0/` | v0 | 2026-05-06 (9 interactions from `2026-05-06.jsonl`) | 0.061 final (label-masked) | rank 16, 15.3M trainable params, **29 MB safetensors** (bf16). Task 08 scaffold validation run; not personalized in any meaningful sense — just proves the pipeline produces a real adapter. Trainer scratch lives at `/shared-docker/training-runs/v0-checkpoints/`. |

## Pushed to HF

| Repo | Last sync | Notes |
|------|-----------|-------|
| (none yet) | | |
