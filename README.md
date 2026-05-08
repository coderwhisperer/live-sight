<img src="frontend/public/logo-wordmark.svg" alt="Live Sight" width="380">

A vision assistant that learns you.

Jamshed comes home, sets his keys on the coffee table, and goes to make chai.
Hours later he can't remember where he put them, and asks his phone. The phone
remembers — coffee table, same spot as before — and tells him.

## Try it

**Live demo:** https://friendly-coder-ai-live-sight.static.hf.space

Phone recommended (uses camera). Best in Chrome on Android or Safari on iOS.

## What it does

Live Sight is a vision assistant for blind and low-vision users. Tap a mode —
Navigate, Read, Scene, or Ask — and the phone describes what it sees in plain
language and reads it aloud; in Ask, you hold the button and speak a question.
Past interactions are logged; later questions answer from that history.
Corrections you give during the day drive an overnight LoRA fine-tune, so the
next morning's model prefers your phrasing.

## Evidence

### Recall

Asked an hour after the keys went down on the coffee table, with the camera
pointing at a different room:

> **Q:** where did I put my keys
>
> **A:** You left your keys on the wooden coffee table earlier — same spot as before.

The answer doesn't come from the current frame. It comes from
[`/recall`](backend/src/livesight/inference/server.py), which retrieves the
closest past interaction by sentence-transformer cosine similarity and grounds
the model's response in that retrieved context.

### Personalization

A handwritten study-methods note had two unfamiliar terms — "Kumon Method" and
"Suid (Art of focus)". The user corrected those readings to "Kuman" and "Suud"
on the spot, by voice. After an overnight LoRA fine-tune on a handful of
corrections like this, same image, greedy decode (`temperature=0.0`):

| Model | "Kumon Method" → | "Suid" → |
|---|---|---|
| base Qwen3-VL-8B | Kumon Method | Suid |
| livesight-v0 (no corrections) | Kumon Method | Suid |
| livesight-v1 (5 corrections) | **Kuman Method** | **Suud** |

The shift is toward what the user wrote — not toward what the model
auto-produced. Twenty-five training examples, a 29 MB adapter, ~9 minutes of
training. Full side-by-side in
[data-backup/comparisons/v1-vs-v0-vs-base.md](data-backup/comparisons/v1-vs-v0-vs-base.md).

## Architecture

Vision via [Qwen3-VL-8B-Instruct](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct)
served by [vLLM](https://github.com/vllm-project/vllm). STT via local
[faster-whisper](https://github.com/SYSTRAN/faster-whisper) for voice input and
corrections. LoRA adapters for per-user personalization, hot-swappable in vLLM
via its runtime adapter API. Semantic retrieval via
[sentence-transformers MiniLM](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
over the day's interaction log. FastAPI orchestrates the backend; React + Vite
+ cloudflared tunnel + Hugging Face Static Space for the frontend.

Backend endpoints:

- `/describe` — single-tap photo description (Navigate / Read / Scene)
- `/transcribe` — audio → text for voice corrections and Ask mode
- `/query` — image + transcribed question → focused answer
- `/recall` — retrieves the closest past interaction and answers from it
- `/interaction-log` — append-only JSONL of every interaction; the dataset for nightly training
- `/admin/swap-adapter` — load a new LoRA adapter into vLLM without a restart

Built for the AMD Developer Hackathon, May 2026 — vision and overnight LoRA
training run on AMD MI300X via ROCm + vLLM.

## Local development

The droplet's local disk is scratch only. The playbook below rebuilds the
entire serving stack on a fresh AMD MI300X droplet — clone the repo, paste an
HF token, run two scripts. ~15 minutes end-to-end on a cold cache; ~1 minute
on a re-provision.

```bash
git clone -b develop https://github.com/coderwhisperer/live-sight.git
echo "HF_TOKEN=..." > live-sight/.env
./live-sight/scripts/dev/restore-claude.sh
./live-sight/scripts/dev/provision.sh
```

`provision.sh` handles the model download, venv, vLLM start, FastAPI start, and
a smoke test. It also restores adapters and the interaction JSONL from
`data-backup/`. Once it finishes, start a cloudflared tunnel at port 8001 if
you want the backend reachable from a phone — see
[docs/wiki/hf-space-runbook.md](docs/wiki/hf-space-runbook.md) for the
redeploy procedure when the tunnel rotates.

## Project context

AMD Developer Hackathon submission, May 2026. Source of truth for project
state lives in [docs/wiki/](docs/wiki/) — setup, ADRs, gotchas, and an
iteration log of what was tried and what worked.
