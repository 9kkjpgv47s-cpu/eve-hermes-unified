#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${UNIFIED_EVIDENCE_DIR:-$ROOT_DIR/evidence}"
mkdir -p "$OUT_DIR"

export EVE_TASK_DISPATCH_SCRIPT="${EVE_TASK_DISPATCH_SCRIPT:-$ROOT_DIR/scripts/ci-eve-dispatch-stub.sh}"
export EVE_DISPATCH_RESULT_PATH="${EVE_DISPATCH_RESULT_PATH:-/tmp/eve-hermes-unified-failure-injection.json}"
export HERMES_LAUNCH_COMMAND="${HERMES_LAUNCH_COMMAND:-bash}"
export HERMES_LAUNCH_ARGS="${HERMES_LAUNCH_ARGS:-$ROOT_DIR/scripts/ci-hermes-dispatch-stub.sh}"

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

  echo
  echo "Case 4: Eve lane non-zero exit with stderr capture"
  EVE_TASK_DISPATCH_SCRIPT=$ROOT_DIR/scripts/ci-eve-exit7-stub.sh \
  UNIFIED_ROUTER_DEFAULT_PRIMARY=eve \
  UNIFIED_ROUTER_DEFAULT_FALLBACK=none \
  UNIFIED_ROUTER_FAIL_CLOSED=1 \
  node "$ROOT_DIR/dist/src/bin/unified-dispatch.js" --text "fail" --chat-id "100" --message-id "4" || true

  echo
  echo "Case 5: Eve state invalid JSON"
  EVE_TASK_DISPATCH_SCRIPT=$ROOT_DIR/scripts/ci-eve-invalid-json-stub.sh \
  UNIFIED_ROUTER_DEFAULT_PRIMARY=eve \
  UNIFIED_ROUTER_DEFAULT_FALLBACK=none \
  UNIFIED_ROUTER_FAIL_CLOSED=1 \
  node "$ROOT_DIR/dist/src/bin/unified-dispatch.js" --text "badjson" --chat-id "100" --message-id "5" || true

  echo "Failure injection smoke ended: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} >"$report" 2>&1

echo "Wrote $report"
