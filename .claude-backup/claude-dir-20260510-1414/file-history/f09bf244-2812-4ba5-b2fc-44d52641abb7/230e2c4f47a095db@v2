"""Tracks which model/adapter FastAPI routes inference requests to.

Two roles:
  - `active`: the vLLM `model` name we send on chat-completion calls.
              Either the base alias (`qwen2-vl`) or an adapter name
              (e.g. `livesight-v0`).
  - `version`: the human-friendly version label that /health reports.
              `"base"`, `"v0"`, `"v1"`, etc.

Updated by the `/admin/swap-adapter` endpoint. Read by `vllm_client` for
every inference call and by `/health`. A short critical section under
`Lock` is enough — single uvicorn worker for v0, no contention.
"""

from dataclasses import dataclass, replace
from threading import Lock

BASE_MODEL_NAME = "qwen2-vl"


@dataclass(frozen=True)
class AdapterState:
    active: str
    version: str


_state = AdapterState(active="livesight-v0", version="v0")
_lock = Lock()


def get_active() -> AdapterState:
    """Snapshot of the current routing target."""
    with _lock:
        return replace(_state)


def set_active(active: str, version: str) -> AdapterState:
    """Atomically update the routing target. Returns the new state."""
    global _state
    with _lock:
        _state = AdapterState(active=active, version=version)
        return _state
