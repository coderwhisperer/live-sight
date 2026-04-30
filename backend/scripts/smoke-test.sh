#!/usr/bin/env bash
set -euo pipefail

TEST_IMAGE_URL="https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=512"
IMAGE_B64=$(curl -sL "$TEST_IMAGE_URL" | base64 -w 0)

RESPONSE=$(curl -s http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d "{
    \"model\": \"qwen2-vl\",
    \"messages\": [{
      \"role\": \"user\",
      \"content\": [
        {\"type\": \"image_url\", \"image_url\": {\"url\": \"data:image/jpeg;base64,$IMAGE_B64\"}},
        {\"type\": \"text\", \"text\": \"Describe what is in this image in one sentence.\"}
      ]
    }],
    \"max_tokens\": 100
  }")

DESCRIPTION=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['choices'][0]['message']['content'])")

if [[ -z "$DESCRIPTION" ]]; then
  echo "FAIL: empty response"
  echo "$RESPONSE"
  exit 1
fi

echo "PASS: model responded with: $DESCRIPTION"
