#!/usr/bin/env bash
set -euo pipefail

LATEST_DIR=$(ls -1d /shared-docker/live-sight/.claude-backup/claude-dir-* | tail -1)
LATEST_JSON=$(ls -1 /shared-docker/live-sight/.claude-backup/claude-json-*.json | tail -1)

# CRITICAL: ~/.claude must NOT exist before this copy
rm -rf ~/.claude ~/.claude.json
cp -r "$LATEST_DIR" ~/.claude
cp "$LATEST_JSON" ~/.claude.json

# Verify
ls ~/.claude/
du -sh ~/.claude "$LATEST_DIR"
