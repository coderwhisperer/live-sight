# Droplet Setup State

Current state of the live droplet. Update this when:
- A service starts/stops
- A model is downloaded
- An adapter is trained
- The droplet is destroyed (note the destroy time)

## Last updated

2026-05-06 — pre-break audit. Tasks 08 (LoRA training scaffold) and 09
(adapter hot-swap) both complete and pushed. v0 adapter + interaction
JSONL backed up into the repo at `data-backup/`. Recovery playbook
extended with an adapter/data restore step. HEAD: `76a3430`.

History: 2026-05-06 `165.245.142.107` (current, came up via recovery
playbook); 2026-05-05 `165.245.141.6` (destroyed); 2026-05-04
`129.212.179.191` (destroyed).

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
| vLLM    | rocm container | 8000 (internal only)   | running (pid 3639 in container, with `--enable-lora`)       | `/shared-docker/logs/vllm.log`                                     |
| FastAPI | host           | 8001 (public)          | running (host PID at `/shared-docker/logs/api.pid`, was 296301)| `/shared-docker/logs/api.log` + `/shared-docker/logs/api.stdout.log` |
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

# 5. Restore adapters and interaction JSONL from the in-repo backup.
#    `data-backup/` is committed — the v0 LoRA adapter and any past
#    interaction data come down with the clone. Copy them out to the
#    paths the runtime expects:
mkdir -p /shared-docker/adapters /shared-docker/data/interactions
cp -r /shared-docker/live-sight/data-backup/adapters/* /shared-docker/adapters/
cp /shared-docker/live-sight/data-backup/interactions/*.jsonl /shared-docker/data/interactions/

# 6. Re-load v0 adapter into the running vLLM and route FastAPI to it.
#    provision.sh starts vLLM with --enable-lora but doesn't load adapters.
./backend/scripts/swap-adapter.sh /shared-docker/adapters/v0
```

After provision + restore exits cleanly, update the **Last updated** and
**Public IP** fields above. Run `backend/scripts/smoke-test-api.sh` from
your laptop using the new public IP to confirm external reachability.
Verify `/health` reports `"adapter_version": "v0"`.

Before destroying, run `scripts/dev/destroy-safely.sh` from the host to
push any uncommitted state to GitHub, snapshot Claude Code state into the
repo, and push adapters/data to HF. The pre-break audit on 2026-05-06
also added a checked-in `data-backup/` snapshot to the repo (adapter +
JSONL); re-run that snapshot before destroy if newer adapters or
interaction data exist.

## Adapters on disk

| Path | Version | Trained on | Loss | Notes |
|------|---------|-----------|------|-------|
| `/shared-docker/adapters/v0/` | v0 | 2026-05-06 (first 9 of `2026-05-06.jsonl`) | 0.061 final (label-masked, curve 0.27→0.004) | rank 16, 15.3M trainable params, **29 MB safetensors** (bf16). Task 08 scaffold validation run. Loaded into vLLM at runtime under name `livesight-v0` (task 09); FastAPI's `AdapterState` defaults to it. Trainer scratch at `/shared-docker/training-runs/v0-checkpoints/`. **Backed up in repo at `data-backup/adapters/v0/`.** |

## Interaction data

| File | Entries | Notes |
|------|---------|-------|
| `/shared-docker/data/interactions/2026-05-06.jsonl` | 11 | Real interactions from the 2026-05-06 phone testing session. Mix of modes (scene/navigate/read). v0 trained on the first 9 rows; rows 9-10 are post-training and a held-out reference for task 11. **Backed up in repo at `data-backup/interactions/2026-05-06.jsonl`.** |

JSONL row schema: `{image_b64, mode, response, ts, user_correction|null}`.
Each `image_b64` is the resized 768px-max-dim JPEG used for inference;
file sizes reflect that (~85 KB per row average).

## Pushed to HF

| Repo | Last sync | Notes |
|------|-----------|-------|
| (none yet) | | |
