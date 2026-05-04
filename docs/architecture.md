# Architecture

## Data flow

1. User taps the camera button in the React frontend.
2. Frontend captures a still image, resizes to 768px max dimension,
   base64-encodes it.
3. Frontend POSTs to `/describe` on the AMD droplet backend.
4. FastAPI handler forwards the image to local vLLM via the OpenAI-compatible
   chat completions API.
5. vLLM processes through Qwen2-VL-7B (with the user's LoRA adapter applied)
   and returns text.
6. Backend returns `{ description, latency_ms }` to frontend.
7. Frontend speaks the description via TTS.
8. Frontend POSTs to `/interaction-log` (fire-and-forget) for nightly training.

## Components

### Backend (Python, droplet)

- **vLLM server**: port 8000. Runs **inside Docker container `rocm`**,
  started detached with `docker exec -d`, log at `/shared-docker/logs/vllm.log`.
  Loads Qwen2-VL-7B in BF16 with the active LoRA adapter. Port 8000 is
  internal (DOCKER-USER iptables DROP rule blocks external access).
- **FastAPI server**: port 8001. Runs **on the host** (not in the container),
  started with `nohup`, PID at `/shared-docker/logs/api.pid`. Stateless
  except for the interaction log file path. Public surface for the HF Space.
- **Training job**: `scripts/train-nightly.sh`. Runs **inside the `rocm`
  container** via `docker exec`, triggered manually for now (Phase 2: cron).

### Frontend (TypeScript, HF Space)

- Single-page React app. Three components: camera, mode toggle, response.
- Uses Vite for build. Deployed as static files to HF Space.

## Adapter hot-swap

The personal LoRA adapter is loaded at vLLM startup via `--lora-modules`.
To swap:

1. Train new adapter to `/shared-docker/adapters/v<N>/`
2. Use vLLM's runtime adapter loading endpoint (or restart vLLM with
   the new adapter path).
3. Update `adapter_version` in the FastAPI health endpoint response.

## Persistent state — where things live

| What | Where | Why |
|------|-------|-----|
| Source code, docs, scripts | GitHub: `coderwhisperer/live-sight` (private) | Version control, survives droplet destroy |
| LoRA adapters, model snapshots | HF model repo: `friendly-coder-ai/live-sight` (private) | HF model serving features, adapter hub |
| Interaction logs, training pairs, eval sets | HF dataset repo: `friendly-coder-ai/live-sight-data` (private) | HF dataset viewer, separates data from models |
| Conversation history (`~/.claude/`) | GitHub: `.claude-backup/` in main repo | Backed up via `destroy-safely.sh` before each destroy |
| Demo videos, reference images | User-managed, off-platform | Not project state, separate workflow |

The droplet's local disk is **scratch only**. Anything not on GitHub or HF
when you destroy is gone. The `destroy-safely.sh` script pushes everything
to its proper home before destroy.

## Secrets

- `HF_TOKEN`: for downloading models, pushing adapters, pushing datasets.
  Stored in `/shared-docker/live-sight/.env` on the host (gitignored).
  Needs write scope on both HF repos.
- `ELEVENLABS_API_KEY`: optional, for premium TTS.

Never commit secrets.
