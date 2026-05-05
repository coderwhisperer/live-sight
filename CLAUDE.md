# Live Sight — Claude Code Context

You (Claude Code) are running ON the AMD MI300X droplet, working as the
primary developer. The human you're working with is the project lead.

This file gets read at the start of every session.

## How to use this file

This file is a living source of truth, not a frozen one.

- **Docs vs. your training assumptions**: docs win. If your training data
  says "the latest version of X is Y" and this file says "we use Z," trust
  this file. Your training is older than this project.
- **Docs vs. live conversation with the user**: conversation wins, but the
  docs MUST be updated in the same session to reflect the new decision.
  Never leave the docs contradicting an explicit decision.
- **You vs. the docs without the user**: docs win. If you're tempted to
  silently deviate from what's written here because your judgment differs,
  stop and surface the disagreement to the user instead.

When the user makes a decision that contradicts this file, your response
should be: "Got it. I'll update the relevant doc in this session" — then
do it before moving on.

## What this project is

Live Sight: a personal vision assistant for blind and low-vision users.
A vision assistant that learns each user through nightly LoRA fine-tuning
on their interactions. Runs on AMD MI300X (192GB HBM3).

Hackathon: AMD Developer Hackathon, online May 4-9, 2026, finals May 9-10.
Submission deadline: May 9.

## What it is NOT

- Not test-time training (we do nightly batched LoRA, not gradient updates
  during inference). Never write code that updates weights mid-inference.
- Not a chatbot. Interaction model is camera-tap-listen.
- Not multi-user. One user, one personal adapter.
- Not multilingual yet (Phase 2). Demo focuses on Urdu + English.

## Architecture

```
[ AMD MI300X host droplet ]
    └── Docker container `rocm` (vLLM image, ROCm 7)
        ├── vLLM serving Qwen2-VL-7B (port 8000, published to host)
        ├── FastAPI backend (port 8001 — planned, also published to host)
        └── Nightly LoRA training (PyTorch + peft)
                    │
                    │  HTTPS/JSON over public droplet IP
                    ▼
[ Hugging Face Space ]
    └── React frontend — camera/mic/TTS, calls backend API
```

`/shared-docker` is bind-mounted from host into the container at the same
path, so paths in code are identical on both sides — see
[backend/CLAUDE.md](backend/CLAUDE.md) for details.

Why every major decision (so you don't second-guess them):

- **AMD MI300X**: 192GB HBM3 lets us keep vision + reasoning + STT + TTS +
  user LoRA all resident. This is the hackathon's hardware story.
- **Qwen2-VL-7B**: well-supported on ROCm, fast, multilingual.
- **Python backend / TypeScript frontend**: vLLM and PyTorch are Python.
  Frontend is React + Vite + Tailwind.
- **LoRA personalization, not RAG**: weight-level personalization is more
  novel and is the actual reason MI300X memory matters.
- **HF Space frontend, AMD droplet backend**: HF Spaces don't run on AMD
  GPUs. Public Space calls droplet backend via API.

## Conventions

- **Python**: 3.11+, type hints everywhere, ruff for lint/format, pytest.
  Use `pyproject.toml`. No requirements.txt.
- **TypeScript**: 5+ strict, React 18+ functional only, Tailwind 3, shadcn/ui.
  (Scaffolded via `npm create vite@latest` on 2026-05-05 — landed on React 19,
  TS 6, Vite 8. Tailwind pinned to v3 because the shadcn init at the time
  hadn't been re-tested against v4 in this project.)
- **Commits**: conventional commits (feat:, fix:, docs:, refactor:).
  One concern per commit.
- **API contract**: defined in `docs/architecture.md`. If you change the
  contract, change both backend and frontend in the same commit.
- **No premature abstractions**: 13-day project. Inline first, abstract
  only when the same pattern appears 3+ times.
- **Logs**: never log image data. Log metadata + timing only.

## Demo-day priorities (order matters)

When making tradeoffs, this is the priority:

1. The 90s demo video must be impressive — see `docs/demo-script.md`.
2. The HF Space must work for judges (with backup video ready).
3. README must be human-first — open with Jamshed, not the stack diagram.
4. Code quality matters less than demo quality. No refactoring on Day 6.

## Working on the droplet

You are running ON the host droplet. Concretely this means:

- Your filesystem is the host's filesystem; the repo lives at
  `/shared-docker/live-sight/`.
- GPU workloads (vLLM, PyTorch) run **inside Docker container `rocm`**,
  reached via `docker exec`. The container does not have ROCm tools,
  PyTorch, or vLLM installed on the host — only inside the container.
- Long-running processes (vLLM, FastAPI) are started with `docker exec -d`
  and log to `/shared-docker/logs/`. They survive SSH disconnects because
  the docker daemon owns them — host tmux is not required for that.
- Your `~/.claude/` and `~/.claude.json` are on host disk and will be
  lost if the host is destroyed without backup.

Before destroying the droplet, the user must run `scripts/dev/destroy-safely.sh`
which backs up Claude Code state to GitHub and HF before destroy.

## When in doubt, stop and ask

If a task spec is ambiguous or you're about to make a decision that affects
architecture: stop, ask the user. A 30-second clarifying question saves an
hour of rework on Day 7.

## Persistent state — what lives where

- **Code**: GitHub private repo `coderwhisperer/live-sight` (push at end of every session).
- **Models, adapters**: HF model repo `friendly-coder-ai/live-sight` (private).
- **Interaction logs, training data**: HF dataset repo `friendly-coder-ai/live-sight-data` (private).
- **Demo videos and stills**: separate location (user manages).
- **Conversation history**: `~/.claude/` on droplet, backed up to GitHub
  (`.claude-backup/`) by the destroy-safely script.

See `docs/architecture.md` for the full table.

## Wiki

Project wiki lives at `docs/wiki/`. Update it as you work:

- `docs/wiki/decisions.md` — ADRs for non-obvious choices
- `docs/wiki/iteration-log.md` — what was tried, what worked, what didn't
- `docs/wiki/gotchas.md` — surprises and fixes for future sessions
- `docs/wiki/setup-state.md` — current state of the droplet (what's installed,
  what's running, what's broken)

End every working session by updating the wiki.
