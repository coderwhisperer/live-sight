# Iteration Log

Running log of what was tried, what worked, what didn't. Update at the
end of every Claude Code session.

## Format

```
### YYYY-MM-DD HH:MM — Brief title

**Tried**: what you did
**Result**: what happened
**Next**: what you'll try next session if this is unfinished
```

---

### 2026-05-04 19:35 — Task 01: vLLM serving Qwen2-VL-7B in `rocm` container

**Tried**: Followed task 01 against the AMD ROCm image that ships container
`rocm` already running. Bound `/shared-docker` into the container at the
same path, downloaded Qwen2-VL-7B to `/shared-docker/models/qwen2-vl-7b/`
via `docker exec rocm huggingface-cli`, started vLLM detached with
`docker exec -d rocm bash -c 'nohup vllm serve … &'` logging to
`/shared-docker/logs/vllm.log`, ran the smoke test from the host.

**Result**: PASS. `curl localhost:8000/v1/models` returns `qwen2-vl`.
Smoke test: *"A man and a woman are cooking in a kitchen, with the man
stirring ingredients into a pot and the woman holding a pan."* Wall clock
from container-already-running to PASS: ~15 minutes (model download was
~10 s — AMD's network had it cached). vLLM cold-start was ~34 s.

Three doc deltas were needed because the task spec didn't match reality:
the bare-host vLLM install, `/workspace/live-sight/` paths, and host
tmux for service lifecycle were all wrong for this image. See commit
`a44a24d` for the rewrite. Reasoning lives in `decisions.md`.

**Next**: Task 02 — FastAPI wrapper exposing `/describe`, `/query`,
`/interaction-log`, `/health`. Run it inside the `rocm` container the
same way (detached `docker exec`, log to `/shared-docker/logs/api.log`).

---

### 2026-05-04 20:50 — Task 02: FastAPI wrapper, host-side

**Tried**: Built FastAPI service `livesight.inference.server` exposing
`/health`, `/describe`, `/query`, `/interaction-log`. Server-side image
resize to 768px max dim before forwarding to vLLM, JSON request log to
`api.log` via a middleware (no image bytes), interaction log appended
as JSONL to `/shared-docker/data/interactions/YYYY-MM-DD.jsonl`.

Architecture call **changed mid-session**: task 02 spec locks FastAPI on
the **host**, not in the container as `backend/CLAUDE.md` previously
implied. Updated docs in commit `cd21c65` before writing code so they
couldn't drift. ADR is in `decisions.md` (host can reach vLLM via the
already-published `localhost:8000`, and DOCKER-USER doesn't filter 8001,
so 8001 ends up correctly public for the HF Space).

Used `pip + venv` (no `uv` on the box). Install of fastapi+uvicorn+httpx
+pillow+multipart+dotenv took ~12s. Editable install of the local package.

**Result**: PASS at every layer.
- /health: 17 ms
- /describe cold (first call after process start, vLLM already warm): **419 ms**
- /describe warm median over 5 calls: **369 ms** (range 369–373 — very tight)
- /query (one frame, "what are the people doing?"): 205 ms
- /query missing recent_frames_b64: 400 (intentional)
- /interaction-log: writes JSONL line, returns `{logged: true}` in <1 ms
- External smoke test from user's laptop in **Karachi → Atlanta**: 372 ms
  for /describe. (Karachi→Atlanta TCP RTT is ~150 ms, so server-side ~220 ms
  after the GPU got hotter — actually beats the host-side warm median.
  Variance dominated by GPU clock state, not network.)

Sensible description on both ends. Minor man/woman role-swap on the
Unsplash kitchen image — model accuracy ceiling, not a code bug.

Performance budget per `backend/CLAUDE.md` is /describe <2s p95 — we're
at ~370 ms warm. ~5x of headroom for adapter overhead in task 04.

**Next**: Task 03 — mode-aware system prompts (navigate/read/scene
should produce noticeably different outputs). The `mode` field is
already plumbed through to the handler but currently ignored.

---

### 2026-05-05 — Task 06 (renumbered from 03): mode-aware prompts

**Tried**: Wired the `mode` field through to vLLM. Eight prompt iterations
on the same fixed image matrix (kitchen, hallway, open-book stack with
visible spine titles "BEAUTY FOOD," "Home, Chic," "What on earth"):

| Iter | Approach | Result |
|------|----------|--------|
| 1 | System role, advisory ("focus on...") | Modes nearly indistinguishable |
| 2 | System role, aggressive ("you will ONLY... you will NOT...") + example outputs | Read bailed every input; navigate echoed example verbatim on kitchen |
| 3 | Structural change: prepend system to user message text | Read still bailed; kitchen-navigate stopped regurgitating |
| 4 | Soften read's bail clause, move to end | Read still bailed |
| 5 | Drop the verbatim canned string, vary wording | Read bailed with the new example string instead — attractor was the example, not the specific phrase |
| 6 | Drop the no-text example entirely, soften restrictions | OCR engaged (370ms vs ~90ms canned), but model refused to commit ("not clear enough to read") and described scenes on no-text inputs |
| 7 | **Switch to simple direct user prompts; drop system role entirely** | All 5 acceptance criteria pass. Read transcribes "BEAUTY FOOD" / "HOME CHIC". Navigate is image-specific. |
| 8 | Tighten navigate prompt (direction-first, not describe-then-navigate) + per-mode max_tokens (navigate=350, others=600) | Final committed state |

**Result on iteration 8 (committed)**, same fixed test images:

- `/describe?mode=navigate` (511–580 ms): direction-first output —
  *"In front of you, there's a man and a woman... To your left, there's
  a stove... To your right, there's a counter..."* and on hallway,
  *"...about 3 paces away from you."* All three under the 2s p95 budget.
- `/describe?mode=read` (67–132 ms): transcribes when text present
  (`"BEAUTY FOOD"`, `"HOME CHIC"` from the open-book stack); produces
  natural-language no-text response otherwise (varies in phrasing —
  no fixed string contract).
- `/describe?mode=scene` (467–673 ms): atmospheric, image-specific. Bonus:
  scene mode reads even more text than read mode on the book stack
  (transcribes `"India Mahdavi"` in addition to BEAUTY FOOD / HOME CHIC).

**Key learnings (full ADR in `decisions.md`)**:

1. Qwen2-VL-7B treats the `system` role weakly when the user message
   contains an image. System-prompt examples become attractors the
   model echoes verbatim instead of grounding it in the actual image.
2. Removing the structured prompt machinery (ROLE/OUTPUT FORMAT
   headers, hard restrictions, example outputs) made all three modes
   work better, not worse. Counterintuitive but reproducible.
3. Per-mode `max_tokens` matters: navigate at 600 tokens went over
   the 2s budget on the hallway image (2159 ms) because the model
   wrote everything it possibly could; capped at 350 it stays under
   600 ms on the same image.

**Next**: Task 07 (frontend ↔ real backend integration test) or task 08
(LoRA training scaffold). LoRA fine-tuning is the right place to refine
output style further (e.g. tighter scene narration, cleaner navigate
disambiguation between "what's there" and "how to move").

---

### 2026-05-05 (later) — Task 06 addendum: Qwen2-VL → Qwen3-VL-8B swap

**Tried**: After locking iteration-8 prompts on Qwen2-VL-7B, A/B'd
against Qwen3-VL-8B-Instruct on the same fixed image matrix. Same
prompts, same `max_tokens` per mode, same vLLM 0.17.1+rocm700.
Downloaded `Qwen/Qwen3-VL-8B-Instruct` to `/shared-docker/models/qwen3-vl-8b/`
(17 GB), kept the existing 2-VL model on disk as a fallback. Restarted
vLLM pointed at the 3-VL model under the same `--served-model-name qwen2-vl`
alias so FastAPI didn't need to change.

**Result**: 3-VL won decisively. The standout case is kitchen-navigate:
- Qwen2-VL produced inventory-style output ("In front of you, there's a
  man and a woman... To your left, there's a stove...").
- Qwen3-VL produced actual navigation ("about 1 pace away... 1.5 paces
  away, hip-height... red pot is eye-level, hot. The griddle is close to
  your face — don't lean in.").

Read mode also materially better — 3-VL transcribed all three visible
spine titles (`BEAUTY FOOD`, `Home Chic`, `What on earth`) plus body
text from the open page. 2-VL only got two spine titles and didn't
attempt body text.

Latencies: 3-VL is slower across the board.
- navigate: 666–2729 ms (was 363–580 ms on 2-VL); kitchen-navigate at
  2.7s is over the `<2s p95` budget but the content gain justifies it.
- read: 81–321 ms (was 67–132 ms on 2-VL).
- scene: 2257–2685 ms (was 467–671 ms); scene is now too verbose for
  comfortable TTS narration but factually richer, including incidental
  text transcription.

**Locked in**: Qwen3-VL-8B-Instruct. Decision in `decisions.md`. The
alias `qwen2-vl` is kept as the served-model-name for FastAPI contract
stability — that name is now historical, not the model. Provision
script now downloads 3-VL by default.

**Next**: Task 07 (frontend ↔ real backend integration test). Watch for
TTS latency over UDP from the demo location; with scene at ~2.5s and
navigate at ~1–3s, response start time will dominate the perceived UX.

---

### 2026-05-06 — Task 07: frontend ↔ real backend, end-to-end on phone

**Tried**: Wired the laptop frontend to the new droplet (`165.245.142.107`)
and verified the full camera → describe → speak loop on a real phone over
the existing cloudflared tunnel. Added the missing `interactionLog`
fire-and-forget call in `App.tsx` after each successful `describe()`.

Initial approach was `VITE_API_BASE_URL=http://165.245.142.107:8001` in
`.env.local`. That works from the laptop but fails on the phone: the
tunnel page is HTTPS, the backend is HTTP, browsers block the mixed-content
fetch ("NetworkError"). Switched to a Vite proxy: keep `API_BASE` as `/api`,
configure `server.proxy['/api']` → `http://165.245.142.107:8001`. Same-origin
from the phone's perspective, no mixed content, no extra CORS plumbing.

**Result**: Working end-to-end on phone over the tunnel. Five interactions
logged to `/shared-docker/data/interactions/2026-05-06.jsonl` on the droplet
in the first session. Latencies tracked iteration-log entries above:
- navigate: ~808 ms — accurate spatial language (hip-height, eye-level, paces).
- read: working on text-bearing photos.
- scene: ~2220 ms — verbose but accurate.

**Tech debt noted**: the proxy target is a hardcoded IP in `vite.config.ts`.
Future cleanup: drive it from an env var so swapping droplets doesn't
require a code edit.

**Next**: Task 08 (LoRA training scaffold) — interaction log is now
producing the data it needs.

