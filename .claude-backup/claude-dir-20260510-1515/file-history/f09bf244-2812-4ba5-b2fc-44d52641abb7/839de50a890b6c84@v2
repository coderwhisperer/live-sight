#!/usr/bin/env bash
set -euo pipefail

cd /shared-docker/live-sight/backend

if [[ -d .venv ]]; then
  source .venv/bin/activate
fi

mkdir -p /shared-docker/logs /shared-docker/data/interactions

if [[ -f /shared-docker/logs/api.pid ]] && \
   kill -0 "$(cat /shared-docker/logs/api.pid)" 2>/dev/null; then
  echo "API already running (PID $(cat /shared-docker/logs/api.pid))"
  exit 0
fi
rm -f /shared-docker/logs/api.pid

nohup uvicorn livesight.inference.server:app \
  --host 0.0.0.0 --port 8001 \
  > /shared-docker/logs/api.stdout.log 2>&1 &

echo $! > /shared-docker/logs/api.pid
echo "API started with PID $(cat /shared-docker/logs/api.pid)"

sleep 2
if curl -sf http://localhost:8001/health > /dev/null 2>&1; then
  echo "API responding to /health"
else
  echo "WARN: API started but /health not responding yet (may still be initializing)"
fi
