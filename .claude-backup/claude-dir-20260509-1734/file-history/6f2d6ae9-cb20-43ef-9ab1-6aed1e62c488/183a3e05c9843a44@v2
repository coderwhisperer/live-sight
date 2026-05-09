#!/usr/bin/env bash
set -euo pipefail

API=http://localhost:8001
TEST_IMAGE_URL="https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=512"

echo "=== /health ==="
HEALTH=$(curl -s -w '\n%{http_code}' "${API}/health")
HEALTH_CODE=$(echo "$HEALTH" | tail -n1)
HEALTH_BODY=$(echo "$HEALTH" | head -n-1)
if [[ "$HEALTH_CODE" != "200" ]]; then
  echo "FAIL /health: HTTP $HEALTH_CODE"
  echo "$HEALTH_BODY"
  exit 1
fi
HEALTH_MODEL=$(echo "$HEALTH_BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(f\"model={d['model']} adapter_version={d['adapter_version']}\")")
echo "PASS /health: $HEALTH_MODEL"

echo
echo "=== /describe ==="
IMAGE_B64=$(curl -sL "$TEST_IMAGE_URL" | base64 -w 0)
PAYLOAD=$(python3 -c "import json,sys;print(json.dumps({'image_b64':sys.argv[1],'mode':'scene'}))" "$IMAGE_B64")
RESPONSE=$(curl -s -X POST "${API}/describe" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")
DESCRIPTION=$(echo "$RESPONSE" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('description',''))")
LATENCY=$(echo "$RESPONSE" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('latency_ms',''))")
if [[ -z "$DESCRIPTION" ]]; then
  echo "FAIL /describe: empty description"
  echo "$RESPONSE"
  exit 1
fi
echo "PASS /describe: $DESCRIPTION"
echo "Latency: ${LATENCY}ms"
