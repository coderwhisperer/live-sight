#!/usr/bin/env bash
# swap-adapter.sh — load a LoRA adapter into vLLM and route /describe to it.
#
# Usage:
#   ./swap-adapter.sh <adapter-path>                          # name/version inferred from basename
#   ./swap-adapter.sh <adapter-path> <adapter-name>           # explicit name, version=basename
#   ./swap-adapter.sh <adapter-path> <adapter-name> <version> # all three explicit
#
#   ./swap-adapter.sh --base                                  # swap back to the base model
#
# Examples:
#   ./swap-adapter.sh /shared-docker/adapters/v0
#       loads it as livesight-v0 (or 'v0' if name not yet uniqued), version=v0
#   ./swap-adapter.sh /shared-docker/adapters/v1 livesight-v1 v1
#   ./swap-adapter.sh --base
#       routes /describe back to the base Qwen3-VL-8B
set -euo pipefail

API=http://localhost:8001

if [[ "${1:-}" == "--base" ]]; then
  PAYLOAD='{"adapter_path": null, "adapter_name": "qwen2-vl", "version": "base"}'
elif [[ -z "${1:-}" ]]; then
  echo "usage: $0 <adapter-path> [name] [version]" >&2
  echo "       $0 --base" >&2
  exit 1
else
  ADAPTER_PATH="$1"
  BASENAME=$(basename "$ADAPTER_PATH")
  ADAPTER_NAME="${2:-livesight-${BASENAME}}"
  VERSION="${3:-${BASENAME}}"

  if [[ ! -d "$ADAPTER_PATH" ]]; then
    echo "ERROR: adapter path '$ADAPTER_PATH' is not a directory" >&2
    exit 1
  fi
  if [[ ! -f "$ADAPTER_PATH/adapter_config.json" ]]; then
    echo "ERROR: '$ADAPTER_PATH/adapter_config.json' missing — not a peft adapter dir?" >&2
    exit 1
  fi

  PAYLOAD=$(python3 -c "
import json, sys
print(json.dumps({
    'adapter_path': sys.argv[1],
    'adapter_name': sys.argv[2],
    'version': sys.argv[3],
}))" "$ADAPTER_PATH" "$ADAPTER_NAME" "$VERSION")
fi

echo "POST ${API}/admin/swap-adapter"
echo "  payload: ${PAYLOAD}"
echo

RESPONSE=$(curl -s -w "\nHTTP %{http_code}" -X POST "${API}/admin/swap-adapter" \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}")
echo "${RESPONSE}"
echo

echo "=== /health ==="
curl -s "${API}/health"
echo
