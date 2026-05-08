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
| FastAPI | host           | 8001 (public)          | running (host PID at `/shared-docker/logs/api.pid`, was 289378). Endpoints now include `/transcribe` (Whisper STT). | `/shared-docker/logs/api.log` + `/shared-docker/logs/api.stdout.log` |
| Whisper | host (in-FastAPI process) | (no port — in-process)  | loaded once at FastAPI startup (~3.6s warm), serves `/transcribe`. CPU/int8, ~2 GB RSS. | shared with FastAPI — `livesight.whisper` logger writes to `api.log` |
| Recall (MiniLM) | host (in-FastAPI process) | (no port — in-process) | loaded once at FastAPI startup (~2.3s warm); index of all interaction JSONLs built at startup (40-ish entries → ~0.5s). Serves `/recall` + `/admin/refresh-recall`. CPU, ~120 MB host RAM. | shared with FastAPI — `livesight.recall` logger writes to `api.log` |
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
| `/shared-docker/models/whisper-large-v3/` | Systran/faster-whisper-large-v3 | 2.9 G | Active — loaded into FastAPI on startup, serves `/transcribe`. CPU/int8 (CT2 has no ROCm support). Downloaded 2026-05-07. |

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

# 4. Run provision — handles model download, venv, vLLM start, FastAPI
#    start, AND data-backup restore (adapters + JSONL → runtime paths,
#    plus loading each adapter into vLLM). Idempotent — safe to rerun.
#    First run ~15 min cold (HF model cache miss), ~1 min on re-provision.
cd /shared-docker/live-sight && ./scripts/dev/provision.sh
```

That's it — 4 commands. provision.sh internally calls
`scripts/dev/restore-data.sh` after FastAPI is up, which copies any
adapters/JSONL from `data-backup/` into runtime locations and loads the
highest-versioned adapter as the active routing target. Pre-2026-05-06
versions of the playbook had data restoration as separate manual
commands (steps 5-6), which were easy to forget — see gotchas.md.

After provision exits cleanly, update the **Last updated** and **Public
IP** fields above. Run `backend/scripts/smoke-test-api.sh` from your
laptop using the new public IP to confirm external reachability. Verify
`/health` reports `"adapter_version": "v0"`.

Before destroying, run `scripts/dev/destroy-safely.sh` from the host to
push any uncommitted state to GitHub, snapshot Claude Code state into the
repo, and push adapters/data to HF. The pre-break audit on 2026-05-06
also added a checked-in `data-backup/` snapshot to the repo (adapter +
JSONL); re-run that snapshot before destroy if newer adapters or
interaction data exist.

## Adapters on disk

| Path | Version | Trained on | Loss | Notes |
|------|---------|-----------|------|-------|
| `/shared-docker/adapters/v0/` | v0 | 2026-05-06 (first 9 of `2026-05-06.jsonl`) | 0.061 final (label-masked, curve 0.27→0.004) | rank 16, 15.3M trainable params, **29 MB safetensors** (bf16). Task 08 scaffold validation run. Loaded into vLLM at runtime under name `livesight-v0`. Trainer scratch at `/shared-docker/training-runs/v0-checkpoints/`. **Backed up in repo at `data-backup/adapters/v0/`.** |
| `/shared-docker/adapters/v1/` | v1 | 2026-05-07 (25 valid entries from both days; 5 had corrections, 20 didn't) | 0.279 mean train_loss (label-masked, curve 0.73→~0.06 with two transient spikes from shuffle) | **Active.** rank 16, 15.3M trainable params, **29 MB safetensors** (bf16). Task 11 demo adapter. Trained 100 steps in 1m52s. Outcome A on read-mode-corrected entry (visibly incorporates user's edits — `Kumon→Kuman`, `Suid→Suud`); Outcome B on uncorrected entries (similar to v0, tighter style). Loaded into vLLM as `livesight-v1`; FastAPI's `AdapterState` set to it. Trainer scratch at `/shared-docker/training-runs/v1-checkpoints/` (4 step checkpoints + final). **Backed up in repo at `data-backup/adapters/v1/`.** |

## Interaction data

| File | Entries | Notes |
|------|---------|-------|
| `/shared-docker/data/interactions/2026-05-06.jsonl` | 11 | Real interactions from the 2026-05-06 phone testing session. Mix of modes (scene/navigate/read). v0 trained on the first 9 rows; rows 9-10 are post-training and a held-out reference for task 11. **Backed up in repo at `data-backup/interactions/2026-05-06.jsonl`.** |

JSONL row schema:
`{ts, id, image_b64, mode, response, user_correction|null, question|null, correction_ts?}`.
- `id` (uuid) — generated on first log; used to PATCH a correction onto
  the row later via `PATCH /interaction-log/{id}`.
- `mode` — one of `navigate` / `read` / `scene` / `ask` / `recall`. The
  first three come from `/describe`; `ask` is auto-logged from
  `/query`; `recall` is auto-logged from `/recall` (so recall-mode
  answers themselves become retrievable on later queries).
- `question` — only populated for `ask`-mode rows (the user's literal
  question). Null for the other modes, where the user prompt was
  mode-specific and not user-supplied text.
- `correction_ts` — added when a correction is PATCHed onto the row.

Each `image_b64` is the resized 768px-max-dim JPEG used for inference
(~85 KB per row average).

Endpoints exposed by FastAPI on `0.0.0.0:8001`: `/health`, `/describe`,
`/query`, `/interaction-log` (POST + PATCH), `/transcribe`,
`/admin/swap-adapter`. See `backend/CLAUDE.md` for full contracts.

## Pushed to HF

| Repo | Last sync | Notes |
|------|-----------|-------|
| (none yet) | | |
