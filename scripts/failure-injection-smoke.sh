#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${UNIFIED_EVIDENCE_DIR:-$ROOT_DIR/evidence}"
mkdir -p "$OUT_DIR"

timestamp="$(date +%Y%m%d-%H%M%S)"
report="$OUT_DIR/failure-injection-$timestamp.txt"

{
  echo "Failure injection smoke started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Case 1: fail-closed policy with Eve primary and no fallback"
  UNIFIED_ROUTER_DEFAULT_PRIMARY=eve \
  UNIFIED_ROUTER_DEFAULT_FALLBACK=none \
  UNIFIED_ROUTER_FAIL_CLOSED=1 \
  node "$ROOT_DIR/dist/src/bin/unified-dispatch.js" --text "hello" --chat-id "100" --message-id "1" || true

  echo
  echo "Case 2: explicit Hermes routing"
  UNIFIED_ROUTER_DEFAULT_PRIMARY=eve \
  UNIFIED_ROUTER_DEFAULT_FALLBACK=hermes \
  UNIFIED_ROUTER_FAIL_CLOSED=0 \
  node "$ROOT_DIR/dist/src/bin/unified-dispatch.js" --text "@hermes status" --chat-id "100" --message-id "2" || true

  echo "Failure injection smoke ended: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} >"$report" 2>&1

echo "Wrote $report"
