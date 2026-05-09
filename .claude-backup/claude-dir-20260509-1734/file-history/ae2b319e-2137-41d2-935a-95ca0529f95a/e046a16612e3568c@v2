#!/usr/bin/env bash
# restore-data.sh — copy adapters and interaction JSONL from
# data-backup/ into runtime locations, then load each adapter into
# vLLM. Counterpart to the snapshot side that destroy-safely.sh
# / pre-break-audit produces in data-backup/.
#
# Called automatically by scripts/dev/provision.sh near the end of
# its run (after FastAPI is verified up, before the smoke test).
# Safe to run standalone — idempotent: rerunning on already-restored
# state is a no-op (skip-if-exists at every copy step).
#
# When multiple adapter directories are present, the lexicographically
# highest (e.g. v1 > v0) becomes the active routing target via
# swap-adapter.sh. Lower adapters are loaded into vLLM but don't
# touch AdapterState — they're available for fast manual swaps.
set -euo pipefail

REPO_DIR=/shared-docker/live-sight
BACKUP_DIR="${REPO_DIR}/data-backup"
RUNTIME_ADAPTERS=/shared-docker/adapters
RUNTIME_INTERACTIONS=/shared-docker/data/interactions
VLLM_URL=http://localhost:8000

step() { printf "\n=== %s ===\n" "$*"; }

step "restore-data"
echo "  backup:    ${BACKUP_DIR}"
echo "  adapters:  ${RUNTIME_ADAPTERS}"
echo "  jsonls:    ${RUNTIME_INTERACTIONS}"

if [[ ! -d "${BACKUP_DIR}" ]]; then
  echo "no data-backup found at ${BACKUP_DIR}, skipping restore"
  exit 0
fi

mkdir -p "${RUNTIME_ADAPTERS}" "${RUNTIME_INTERACTIONS}"

restored_adapters=0
skipped_adapters=0
restored_jsonl=0
skipped_jsonl=0

# ---- Copy adapters from backup ----
if [[ -d "${BACKUP_DIR}/adapters" ]]; then
  for src in "${BACKUP_DIR}/adapters"/*/; do
    [[ -d "$src" ]] || continue
    name=$(basename "$src")
    dst="${RUNTIME_ADAPTERS}/${name}"
    if [[ -d "$dst" ]]; then
      echo "adapter ${name} already at runtime location, skipping restore"
      skipped_adapters=$((skipped_adapters + 1))
    else
      echo "restoring adapter ${name}: ${src} -> ${dst}"
      cp -r "$src" "$dst"
      restored_adapters=$((restored_adapters + 1))
    fi
  done
fi

# ---- Copy interaction JSONLs from backup ----
if [[ -d "${BACKUP_DIR}/interactions" ]]; then
  for src in "${BACKUP_DIR}/interactions"/*.jsonl; do
    [[ -f "$src" ]] || continue
    name=$(basename "$src")
    dst="${RUNTIME_INTERACTIONS}/${name}"
    if [[ -f "$dst" ]]; then
      echo "interactions JSONL ${name} exists at runtime, skipping restore"
      skipped_jsonl=$((skipped_jsonl + 1))
    else
      echo "restoring interactions ${name}: ${src} -> ${dst}"
      cp "$src" "$dst"
      restored_jsonl=$((restored_jsonl + 1))
    fi
  done
fi

# ---- Load adapters into vLLM ----
# Enumerate adapters at runtime location (a peft adapter dir contains
# adapter_config.json — that's the marker we use). Sort lexicographically
# so v0 < v1 < v2; the last one wins as the active target.
adapters=()
for d in "${RUNTIME_ADAPTERS}"/*/; do
  [[ -d "$d" && -f "${d}adapter_config.json" ]] || continue
  adapters+=("$(basename "$d")")
done

if [[ ${#adapters[@]} -eq 0 ]]; then
  step "summary"
  echo "  adapters: ${restored_adapters} restored, ${skipped_adapters} skipped"
  echo "  jsonls:   ${restored_jsonl} restored, ${skipped_jsonl} skipped"
  echo "  active adapter: (none — no adapter dirs at runtime location)"
  exit 0
fi

mapfile -t sorted < <(printf '%s\n' "${adapters[@]}" | sort)
highest="${sorted[-1]}"

# Lower adapters: load into vLLM only, don't touch AdapterState. Direct
# call to /v1/load_lora_adapter. vLLM returns 400 with "already exists"
# if the name is already loaded — we treat that as success (idempotent
# rerun).
for ((i=0; i<${#sorted[@]}-1; i++)); do
  name="${sorted[$i]}"
  echo
  echo "loading adapter '${name}' into vLLM (not setting active)..."
  status=$(curl -s -o /tmp/restore-load.out -w '%{http_code}' \
    -X POST "${VLLM_URL}/v1/load_lora_adapter" \
    -H 'Content-Type: application/json' \
    -d "{\"lora_name\": \"livesight-${name}\", \"lora_path\": \"${RUNTIME_ADAPTERS}/${name}\"}")
  if [[ "$status" == "200" ]] || { [[ "$status" == "400" ]] && grep -qi already /tmp/restore-load.out; }; then
    echo "  ok (HTTP ${status})"
  else
    echo "  FAIL (HTTP ${status})" >&2
    cat /tmp/restore-load.out >&2
    exit 1
  fi
done

# Highest adapter: load + set active via swap-adapter.sh, which goes
# through FastAPI's /admin/swap-adapter (updates AdapterState too).
echo
echo "setting active adapter to '${highest}' (highest version)..."
"${REPO_DIR}/backend/scripts/swap-adapter.sh" "${RUNTIME_ADAPTERS}/${highest}"

step "summary"
echo "  adapters: ${restored_adapters} restored, ${skipped_adapters} skipped"
echo "  jsonls:   ${restored_jsonl} restored, ${skipped_jsonl} skipped"
echo "  active adapter: livesight-${highest}"
