# Recovery State Snapshot

Generated: 2026-05-10T15:06:46Z

## Current production state

- Active adapter: livesight-v1_2
- Active version: v1_2
- Interactions logged: 111
- Corrections: 24
- Days active: 5
- Recall index size: 111
- Mode breakdown: {'scene': 16, 'navigate': 12, 'read': 12, 'ask': 55, 'recall': 16}

## HF repos (mirrored as of this snapshot)

- Model: friendly-coder-ai/live-sight (private) — 4 adapters: v0, v1, v1_1, v1_2
- Dataset: friendly-coder-ai/live-sight-data (private) — 5 daily JSONLs + 3 training corpora
- Space: friendly-coder-ai/live-sight (public, Static SDK) — frontend bundle

## Active tunnel URL (will rotate on droplet rebuild)

The current tunnel URL is baked into the HF Space build. After a fresh
droplet provision, the cloudflared tunnel will get a new URL and the
Space frontend must be rebuilt with the new `VITE_API_BASE_URL`.

## Recovery path on a fresh droplet

1. Provision a new MI300X droplet from the AMD ROCm image.
2. `mkdir -p /shared-docker && cd /shared-docker && git clone https://<gh-pat>@github.com/coderwhisperer/live-sight.git`
3. Restore .env: `echo "HF_TOKEN=hf_..." > /shared-docker/live-sight/.env && chmod 600`
4. (Optional) Restore Claude state: `./scripts/dev/restore-claude.sh`
5. `./scripts/dev/provision.sh` — handles model download (~17 GB), venv,
   vLLM start, FastAPI start, and `restore-data.sh` which auto-restores
   adapters + JSONLs from `data-backup/` and loads the highest-versioned
   adapter (v1_2) as active.
6. Start a cloudflared tunnel pointed at `http://localhost:8001`.
7. Update HF Space's `VITE_API_BASE_URL` to the new tunnel URL and
   rebuild — see `docs/wiki/hf-space-runbook.md`.

## What's already off-droplet (verified before this snapshot)

- **GitHub** (`coderwhisperer/live-sight`, develop branch): source code,
  all 4 adapters in `data-backup/adapters/`, all 5 daily JSONLs, training
  corpora, comparison docs, full iteration log.
- **HF model repo**: 4 adapter weights with subfolders + model card.
- **HF dataset repo**: 5 daily JSONLs + 3 training corpora + dataset card.

## What this snapshot adds

- Today's latest JSONL refreshed (final count 111 interactions).
- `trainer_state.json` files for v1.1 and v1.2 (4 checkpoints each) —
  source data for the dashboard's loss curves, previously only living in
  the scratch `/shared-docker/training-runs/` dir.
- This recovery state document.
