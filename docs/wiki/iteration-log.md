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
