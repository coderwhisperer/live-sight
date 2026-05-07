#!/usr/bin/env bash
set -euo pipefail

if [[ -f /shared-docker/logs/api.pid ]]; then
  PID=$(cat /shared-docker/logs/api.pid)
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "Stopped API (PID $PID)"
  else
    echo "PID file exists but process $PID is not running"
  fi
  rm -f /shared-docker/logs/api.pid
else
  echo "No PID file at /shared-docker/logs/api.pid"
fi
