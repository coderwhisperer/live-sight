#!/usr/bin/env bash
# Quick vLLM smoke test — bypasses FastAPI, hits the model directly on
# port 8000. Edit URL or prompt below to test other images / phrasings.
# Useful for isolating whether an issue is in our prompts and server
# (FastAPI side) or in the model itself.
#
# Run from the droplet host. Output: assistant text + token usage line.

# Pick any Unsplash URL, download, base64, test
URL="https://images.unsplash.com/photo-1568667256549-094345857637?w=512"
curl -sL "$URL" | base64 -w 0 > /tmp/img_custom.b64

# Then run the same curl test pointing at the new file
python3 -c "
import json
b64 = open('/tmp/img_custom.b64').read().strip()
print(json.dumps({
    'model': 'qwen2-vl',
    'messages': [{
        'role': 'user',
        'content': [
            {'type': 'image_url', 'image_url': {'url': f'data:image/jpeg;base64,{b64}'}},
            # {'type': 'text', 'text': 'What text is visible in this image? Transcribe it exactly.'}
            # {'type': 'text', 'text': 'What can you see in this image? Describe it exactly.'}
            {'type': 'text', 'text': 'What can you see in this image? Describe it in 1-2 sentences. Then guide a blind person to navigate the scene. Be as detailed as possible.'}
        ]
    }],
    'max_tokens': 300
}))" > /tmp/payload.json

curl -s http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  --data @/tmp/payload.json | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d['choices'][0]['message']['content'])
print('---tokens:', d['usage'])
"