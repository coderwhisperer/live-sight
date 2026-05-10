#!/usr/bin/env bash
# train-lora.sh — run a LoRA fine-tune of Qwen3-VL-8B on a JSONL of
# interactions and save the adapter under /shared-docker/adapters/...
#
# Architecture note: training runs INSIDE the rocm container (where
# torch+ROCm + transformers + peft live). vLLM serving is stopped for
# the duration because both processes can't share the GPU's 192GB —
# vLLM's KV cache fills ~91% by default, leaving no room. The script
# stops vLLM, runs training, then restarts vLLM. Total /health downtime
# is the training time + ~30s vLLM warmup.
#
# Usage:
#   ./train-lora.sh                             # uses today's JSONL + /shared-docker/adapters/v0
#   ./train-lora.sh path/to.jsonl /out/dir
#
# Env overrides:
#   BASE_MODEL=/shared-docker/models/qwen3-vl-8b   (default)
#   SKIP_VLLM_RESTART=1   leave vLLM down after training (useful when
#                         iterating on training; saves a 30s restart)
set -euo pipefail

INPUT_JSONL="${1:-/shared-docker/data/interactions/$(date -u +%Y-%m-%d).jsonl}"
OUTPUT_DIR="${2:-/shared-docker/adapters/v0}"
BASE_MODEL="${BASE_MODEL:-/shared-docker/models/qwen3-vl-8b}"
SKIP_VLLM_RESTART="${SKIP_VLLM_RESTART:-0}"

echo "=== train-lora ==="
echo "  input:  ${INPUT_JSONL}"
echo "  output: ${OUTPUT_DIR}"
echo "  base:   ${BASE_MODEL}"
echo

if [[ ! -f "${INPUT_JSONL}" ]]; then
  echo "ERROR: input JSONL not found at ${INPUT_JSONL}" >&2
  exit 1
fi

# Stop vLLM if running. Retraining the same training run (idempotent
# rerun) will hit this branch a second time as a no-op.
if docker exec rocm pgrep -f 'vllm serve' >/dev/null 2>&1; then
  echo "stopping vLLM to free GPU memory..."
  docker exec rocm pkill -f 'vllm serve' || true
  for _ in $(seq 1 30); do
    if ! curl -sf http://localhost:8000/v1/models >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  echo "vLLM stopped."
else
  echo "vLLM not running, proceeding."
fi

# Run training inside the container. We pass the path as bind-mounted —
# /shared-docker/* is identical on host and container.
mkdir -p "${OUTPUT_DIR}"
echo
echo "=== training (in rocm container) ==="
docker exec rocm bash -c "
  set -euo pipefail
  cd /shared-docker/live-sight/backend/src
  HIP_VISIBLE_DEVICES=0 \\
  PYTORCH_ALLOC_CONF=expandable_segments:True \\
  python3 -m livesight.training.train_lora \\
    --input '${INPUT_JSONL}' \\
    --output '${OUTPUT_DIR}' \\
    --base-model '${BASE_MODEL}'
"

echo
echo "=== adapter contents ==="
ls -la "${OUTPUT_DIR}"

# Restart vLLM unless told otherwise.
if [[ "${SKIP_VLLM_RESTART}" == "1" ]]; then
  echo
  echo "SKIP_VLLM_RESTART=1 — leaving vLLM down. Restart manually when ready."
  exit 0
fi

echo
echo "=== restarting vLLM ==="
docker exec -d rocm bash -c "
  HIP_VISIBLE_DEVICES=0 \\
  PYTORCH_ALLOC_CONF=expandable_segments:True \\
  nohup vllm serve ${BASE_MODEL} \\
    --served-model-name qwen2-vl \\
    --port 8000 \\
    --max-model-len 4096 \\
    --dtype bfloat16 \\
    > /shared-docker/logs/vllm.log 2>&1 &
  disown
"
echo "vLLM restarting in background. Watch /shared-docker/logs/vllm.log"
echo "for 'Application startup complete' (~30s on cold model)."
