#!/usr/bin/env bash
# Backup all critical state before destroying the droplet.
# Run this AS THE LAST THING before clicking destroy in the AMD console.
#
# Usage: ./destroy-safely.sh [--force]
#   --force  Skip the human confirmation prompt at the end

set -euo pipefail

REPO_ROOT="/workspace/live-sight"
HF_MODEL_REPO="${HF_MODEL_REPO:-friendly-coder-ai/live-sight}"
HF_DATA_REPO="${HF_DATA_REPO:-friendly-coder-ai/live-sight-data}"
ADAPTERS_DIR="${ADAPTERS_DIR:-/workspace/adapters}"
DATA_DIR="${DATA_DIR:-/workspace/data}"
FORCE="${1:-}"

cd "$REPO_ROOT"

echo "=== Pre-destroy backup ==="
echo "  Code → GitHub"
echo "  Adapters → HF model: $HF_MODEL_REPO"
echo "  Data → HF dataset: $HF_DATA_REPO"
echo ""

# 1. Confirm clean working tree or stage everything
echo "[1/6] Checking git status..."
if [[ -n "$(git status --porcelain)" ]]; then
  echo "    Uncommitted changes detected. Staging and committing..."
  git add -A
  git commit -m "chore: pre-destroy snapshot $(date -u +%Y-%m-%dT%H:%MZ)"
fi

# 2. Push code to GitHub
echo "[2/6] Pushing code to GitHub..."
git push origin HEAD

# 3. Backup .claude state to the repo
echo "[3/6] Backing up Claude Code state..."
mkdir -p "$REPO_ROOT/.claude-backup"
TIMESTAMP=$(date +%Y%m%d-%H%M)
if [[ -d ~/.claude ]]; then
  cp -r ~/.claude "$REPO_ROOT/.claude-backup/claude-dir-$TIMESTAMP" || true
fi
if [[ -f ~/.claude.json ]]; then
  cp ~/.claude.json "$REPO_ROOT/.claude-backup/claude-json-$TIMESTAMP.json" || true
fi
git add .claude-backup/ || true
git commit -m "chore: backup Claude Code state before destroy" || true
git push origin HEAD

# 4. Push adapters/models to HF model repo
echo "[4/6] Pushing model artifacts to HF model repo..."
if [[ -d "$ADAPTERS_DIR" ]] && [[ -n "$(ls -A "$ADAPTERS_DIR" 2>/dev/null)" ]]; then
  pip install -q huggingface_hub
  python3 -c "
from huggingface_hub import HfApi
api = HfApi()
api.upload_folder(
    folder_path='$ADAPTERS_DIR',
    repo_id='$HF_MODEL_REPO',
    repo_type='model',
    path_in_repo='adapters',
)
print('    Adapters uploaded to $HF_MODEL_REPO')
"
else
  echo "    No adapters directory or empty, skipping."
fi

# 5. Push interaction logs / training data to HF dataset repo
echo "[5/6] Pushing data to HF dataset repo..."
if [[ -d "$DATA_DIR" ]] && [[ -n "$(ls -A "$DATA_DIR" 2>/dev/null)" ]]; then
  pip install -q huggingface_hub
  python3 -c "
from huggingface_hub import HfApi
api = HfApi()
api.upload_folder(
    folder_path='$DATA_DIR',
    repo_id='$HF_DATA_REPO',
    repo_type='dataset',
    path_in_repo='.',
)
print('    Data uploaded to $HF_DATA_REPO')
"
else
  echo "    No data directory or empty, skipping."
fi

# 6. Final confirmation
echo "[6/6] Backup complete."
echo ""
echo "Verify before destroying:"
echo "  - GitHub commit: $(git rev-parse HEAD)"
echo "  - HF model repo: https://huggingface.co/$HF_MODEL_REPO"
echo "  - HF dataset repo: https://huggingface.co/datasets/$HF_DATA_REPO"
echo ""

if [[ "$FORCE" == "--force" ]]; then
  echo "Force mode: skipping confirmation. You may now destroy the droplet."
  exit 0
fi

read -p "Have you verified all three? Type 'yes' to confirm safe to destroy: " CONFIRM
if [[ "$CONFIRM" == "yes" ]]; then
  echo "OK. You may now destroy the droplet from the AMD console."
else
  echo "Backup verified but NOT confirmed. Investigate before destroying."
  exit 1
fi
