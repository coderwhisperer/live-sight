#!/usr/bin/env bash
#
# provision.sh — take a fresh AMD MI300X droplet to the working state
# documented in docs/wiki/setup-state.md.
#
# Assumes:
#   - Droplet provisioned from the AMD ROCm image, container `rocm` already
#     running with /shared-docker bind-mounted at the same path inside.
#   - Repo cloned to /shared-docker/live-sight/ (this script lives in it).
#   - /shared-docker/live-sight/.env exists and contains HF_TOKEN=...
#
# Architecture (so future-you doesn't second-guess what this does and doesn't):
#   - vLLM serves on container port 8000, published to host 8000.
#     INTERNAL ONLY. The AMD ROCm image lays down an iptables DOCKER-USER
#     rule that DROPs external traffic to 8000. This script does NOT modify
#     it — that protection is correct for our architecture.
#   - FastAPI backend will serve on container port 8001, published to host
#     8001 (task 02; not started by this script). It's the public surface
#     for the HF Space frontend. There is no DOCKER-USER rule for 8001,
#     so it'll be reachable from the internet by default once it ships.
#   - To debug vLLM directly from your workstation, use SSH local port
#     forwarding instead of opening 8000:
#       ssh -L 8000:localhost:8000 root@<droplet-ip>
#       curl http://localhost:8000/v1/models   # from your workstation
#
# This script is idempotent: re-running on an already-provisioned droplet
# verifies state and skips work already done.

set -euo pipefail

REPO_DIR=/shared-docker/live-sight
MODELS_DIR=/shared-docker/models
LOGS_DIR=/shared-docker/logs
MODEL_REPO=Qwen/Qwen3-VL-8B-Instruct
MODEL_DIR=${MODELS_DIR}/qwen3-vl-8b
CONTAINER=rocm
VLLM_PORT=8000
# vLLM is served under the "qwen2-vl" alias for backwards-compatible FastAPI
# wiring. The alias is decoupled from the underlying weights — see
# decisions.md ADR for the model swap rationale.
SERVED_MODEL_NAME=qwen2-vl

step() { printf "\n=== %s ===\n" "$*"; }

# ---- 0. Preflight ----
step "preflight"
if ! docker ps --format '{{.Names}}' | grep -qx "${CONTAINER}"; then
  echo "ERROR: container '${CONTAINER}' is not running. Start it before running this script." >&2
  exit 1
fi
if [[ ! -f "${REPO_DIR}/.env" ]]; then
  echo "ERROR: missing ${REPO_DIR}/.env (need HF_TOKEN). Create it first." >&2
  exit 1
fi
if ! grep -q '^HF_TOKEN=..*' "${REPO_DIR}/.env"; then
  echo "ERROR: ${REPO_DIR}/.env has no HF_TOKEN value." >&2
  exit 1
fi
echo "container running, .env present with HF_TOKEN"

# ---- 1. Shared dirs ----
step "ensuring /shared-docker/{models,logs}"
mkdir -p "${MODELS_DIR}" "${LOGS_DIR}"
echo "ok"

# ---- 2. Container restart policy (idempotent) ----
# Defensively set even if the image already does it. Cheap insurance against
# a future image rev that drops the default. `docker update` is a no-op when
# the requested policy already matches.
step "ensuring container restart policy"
current_policy=$(docker inspect "${CONTAINER}" --format '{{.HostConfig.RestartPolicy.Name}}')
docker update --restart unless-stopped "${CONTAINER}" >/dev/null
echo "restart policy: was '${current_policy}', now 'unless-stopped'"

# ---- 3. Clean up the misleading ufw deny on 8000 ----
# The image installs `ufw deny 8000`, which creates both v4 and v6 rules.
# ufw filters INPUT, but docker-published ports flow through FORWARD →
# DOCKER-USER, so this rule is INERT. The actual protection is the
# DOCKER-USER DROP supplied by the image (which we do NOT touch).
# Removing the inert ufw rule so it stops misdirecting future debuggers.
# Loop because depending on ufw version a single `delete` may handle both
# v4 and v6 or only one. --force avoids the interactive y/n prompt.
step "removing inert 'ufw deny 8000' (does not change reachability)"
removed=0
for _ in 1 2; do
  if ufw status | grep -qE '^8000( \(v6\))?[[:space:]]+DENY'; then
    ufw --force delete deny 8000 >/dev/null 2>&1 && removed=1 || true
  else
    break
  fi
done
if [[ $removed -eq 1 ]]; then
  echo "removed misleading 'ufw deny 8000' rule(s)"
else
  echo "no inert ufw rule on 8000"
fi

# ---- 4. Download model (skip if already complete) ----
#
# Note: the `mkdir -p` here is load-bearing. Without it, `find` exits 1 on a
# fresh droplet (directory doesn't exist), pipefail propagates that through
# `find | wc -l`, the simple command `shard_count=$(...)` inherits exit 1,
# and `set -e` kills the script silently — `2>/dev/null` masked find's
# stderr too, so nothing reached the terminal. See gotchas.md.
step "ensuring model at ${MODEL_DIR}"
mkdir -p "${MODEL_DIR}"
shard_count=$(find "${MODEL_DIR}" -maxdepth 1 -name 'model-*.safetensors' | wc -l)
if [[ -f "${MODEL_DIR}/model.safetensors.index.json" ]] && [[ "${shard_count}" -ge 5 ]]; then
  size=$(du -sh "${MODEL_DIR}" | cut -f1)
  echo "model already present (${shard_count} shards, ${size}), skipping download"
else
  echo "downloading ${MODEL_REPO} (~16GB; can take 5-15 minutes)..."
  echo "(progress streams from huggingface-cli below)"
  echo
  docker exec "${CONTAINER}" bash -c '
    set -euo pipefail
    export HF_TOKEN=$(grep ^HF_TOKEN /shared-docker/live-sight/.env | cut -d= -f2-)
    huggingface-cli download '"${MODEL_REPO}"' \
      --local-dir '"${MODEL_DIR}"' \
      --token "$HF_TOKEN"
  '
  # Verify the download actually completed: huggingface-cli's exit status
  # already covers fatal errors, but defense-in-depth against partial state.
  shard_count=$(find "${MODEL_DIR}" -maxdepth 1 -name 'model-*.safetensors' | wc -l)
  if [[ ! -f "${MODEL_DIR}/model.safetensors.index.json" ]] || [[ "${shard_count}" -lt 5 ]]; then
    echo "ERROR: model download finished but state looks incomplete" >&2
    echo "  index.json present: $([[ -f ${MODEL_DIR}/model.safetensors.index.json ]] && echo yes || echo no)" >&2
    echo "  shards: ${shard_count} (expected >=5)" >&2
    exit 1
  fi
  echo "downloaded ${shard_count} shards"
fi

# ---- 5. Backend venv (skip if already provisioned) ----
step "ensuring backend venv at ${REPO_DIR}/backend/.venv"
if [[ -x "${REPO_DIR}/backend/.venv/bin/uvicorn" ]]; then
  echo "venv already provisioned"
else
  # Fresh droplets often lack python3-venv. We do a *targeted* install of
  # only that package (NOT `apt-get upgrade`, which can break ROCm/Docker
  # state — see gotchas.md). Skipped if ensurepip already imports.
  if ! python3 -c 'import ensurepip' 2>/dev/null; then
    echo "python3 ensurepip missing — installing python3-venv (targeted, not an upgrade)..."
    apt-get update -qq
    apt-get install -y python3-venv
  fi
  # Clear any partial venv from a prior failed attempt.
  rm -rf "${REPO_DIR}/backend/.venv"
  echo "creating venv and installing deps..."
  (
    cd "${REPO_DIR}/backend"
    python3 -m venv .venv
    ./.venv/bin/pip install --quiet --upgrade pip
    ./.venv/bin/pip install --quiet -e .
  )
  echo "venv ready"
fi

# ---- 6. Start vLLM (skip if already serving) ----
step "ensuring vLLM is serving on ${VLLM_PORT}"
if curl -sf "http://localhost:${VLLM_PORT}/v1/models" >/dev/null 2>&1; then
  echo "vLLM already responding, skipping start"
else
  if docker exec "${CONTAINER}" pgrep -f 'vllm serve' >/dev/null 2>&1; then
    echo "vllm process exists in container but not yet responding — waiting"
  else
    echo "starting vLLM detached..."
    docker exec -d "${CONTAINER}" bash -c "
      HIP_VISIBLE_DEVICES=0 \
      PYTORCH_ALLOC_CONF=expandable_segments:True \
      nohup vllm serve ${MODEL_DIR} \
        --served-model-name ${SERVED_MODEL_NAME} \
        --port 8000 \
        --max-model-len 4096 \
        --dtype bfloat16 \
        > /shared-docker/logs/vllm.log 2>&1 &
      disown
    "
  fi
  echo "waiting for vLLM (up to 5 minutes)..."
  for _ in $(seq 1 60); do
    if curl -sf "http://localhost:${VLLM_PORT}/v1/models" >/dev/null 2>&1; then
      echo "vLLM ready"
      break
    fi
    sleep 5
  done
  if ! curl -sf "http://localhost:${VLLM_PORT}/v1/models" >/dev/null 2>&1; then
    echo "ERROR: vLLM did not come up. Check ${LOGS_DIR}/vllm.log" >&2
    exit 1
  fi
fi

# ---- 7. Start FastAPI on the host ----
step "ensuring FastAPI is running on 8001"
"${REPO_DIR}/backend/scripts/start-api.sh"
# start-api.sh's own /health check has a 2s wait that's sometimes too short
# on a cold uvicorn process. Wait up to 30s here for the real signal.
echo "waiting for FastAPI /health..."
for _ in $(seq 1 15); do
  if curl -sf http://localhost:8001/health >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
if ! curl -sf http://localhost:8001/health >/dev/null 2>&1; then
  echo "ERROR: FastAPI did not come up. Check /shared-docker/logs/api.stdout.log" >&2
  exit 1
fi
echo "FastAPI ready"

# ---- 8. Verify both endpoints (final gate before reporting success) ----
step "verifying endpoints"
curl -sf http://localhost:8000/v1/models >/dev/null && echo "vLLM /v1/models OK"
curl -sf http://localhost:8001/health    >/dev/null && echo "FastAPI /health OK"

# ---- 9. Smoke test (vLLM end-to-end) ----
step "smoke test"
"${REPO_DIR}/backend/scripts/smoke-test.sh"

step "done"
echo "Droplet is in the state described in docs/wiki/setup-state.md."
