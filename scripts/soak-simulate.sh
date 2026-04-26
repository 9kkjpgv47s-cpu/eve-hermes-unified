#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${UNIFIED_EVIDENCE_DIR:-$ROOT_DIR/evidence}"
mkdir -p "$OUT_DIR"

iterations="${1:-20}"
report="$OUT_DIR/soak-$(date +%Y%m%d-%H%M%S).jsonl"
chat_id="${UNIFIED_SOAK_CHAT_ID:-777}"

for i in $(seq 1 "$iterations"); do
  if (( i % 3 == 0 )); then
    text="@cap summarize_state staged-health-$i"
  elif (( i % 2 == 0 )); then
    text="@hermes status $i"
  else
    text="normal message $i"
  fi

  node "$ROOT_DIR/dist/src/bin/unified-dispatch.js" --text "$text" --chat-id "$chat_id" --message-id "$i" >>"$report" 2>&1 || true
done

echo "Wrote $report"
