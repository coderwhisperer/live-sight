# Architecture Decision Records

Append a one-paragraph entry whenever a non-obvious decision is made.
Format: date, decision, rationale, alternatives considered.

## YYYY-MM-DD — Example entry format

**Decision**: Use Qwen2-VL-7B-Instruct over Llama 3.2-Vision.
**Rationale**: Better Urdu support, faster on ROCm, smaller footprint
leaves room for reasoning model + LoRA in same GPU.
**Alternatives**: Llama 3.2-Vision-11B (rejected: larger, weaker Urdu).

---

## 2026-05-04 — vLLM and FastAPI run inside Docker container `rocm`, not on host

**Decision**: All GPU-touching processes (vLLM, PyTorch training, FastAPI
backend) run inside the pre-existing `rocm` container. Host has no Python
ML stack installed. `/shared-docker` is bind-mounted into the container at
the same path so code paths don't have to translate.

**Rationale**: The AMD ROCm image we provisioned with already ships a
container that has vLLM 0.17.1+rocm700, ROCm 7, and Python 3.12 wired up
correctly. Reinstalling that on the host is duplicate work and fights the
image. Bind-mounting at the same path means `/shared-docker/models/…`
resolves identically from host and container — no path translation in
configs, scripts, or logs.

**Alternatives**:
- Install vLLM directly on host (rejected: duplicates a working setup,
  loses image's known-good ROCm versions).
- Bind-mount at a different path inside container, e.g. `/workspace`
  (rejected: paths in `setup-state.md`, scripts, and tracebacks would
  differ between host and container — a class of confusion not worth it).

## 2026-05-04 — Detached `docker exec -d` replaces tmux for service lifecycle

**Decision**: Long-running services (vLLM, FastAPI) start with
`docker exec -d rocm bash -c 'nohup … > /shared-docker/logs/X.log 2>&1 &'`
rather than from a tmux pane on the host or inside the container.

**Rationale**: tmux's job here was "process survives SSH disconnect" —
the docker daemon already provides that for `docker exec -d` children.
Adding tmux on top is a second lifecycle manager for no extra guarantee.
Logs to a file in the bind mount are reattachable via `tail -f` from
either side, which is all we'd use a tmux scrollback for.

**Alternatives**:
- tmux session on host, with each pane running `docker exec -it`
  (rejected: nested terminal multiplexing, harder to script, harder for
  Claude Code sessions to inspect).
- tmux *inside* the container (rejected: same survival guarantee for more
  ceremony; reattaching from a fresh shell requires `docker exec -it` +
  `tmux attach` instead of `tail -f log`).
