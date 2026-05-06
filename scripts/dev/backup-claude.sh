#!/usr/bin/env bash
# backup-claude.sh — snapshot current ~/.claude state into .claude-backup/
# inside the repo, commit, and push. Counterpart to restore-claude.sh.
# Use this manually when you want a backup without going through the full
# destroy-safely.sh flow (e.g., during a long working session, or before
# trying something risky in Claude Code state).
set -euo pipefail

cd /shared-docker/live-sight

# Make sure backup directory exists
mkdir -p .claude-backup

# Stamp with current time
TS=$(date +%Y%m%d-%H%M)

# Back up the directory (no trailing slash — copies AS claude-dir-TS, not into it)
cp -r ~/.claude .claude-backup/claude-dir-${TS}

# Back up the JSON file
cp ~/.claude.json .claude-backup/claude-json-${TS}.json

# Verify
ls -la .claude-backup/ | tail -5

# Commit and push
git add .claude-backup/
git commit -m "chore: claude state backup ${TS}"
git push origin develop