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

