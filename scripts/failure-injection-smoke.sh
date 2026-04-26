#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${UNIFIED_EVIDENCE_DIR:-$ROOT_DIR/evidence}"
mkdir -p "$OUT_DIR"

timestamp="$(date +%Y%m%d-%H%M%S)"
report="$OUT_DIR/failure-injection-$timestamp.txt"

run_case() {
  local label="$1"
  shift
  echo "==== $label ===="
  "$@" || true
  echo
}

{
  echo "Failure injection smoke started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  run_case "Case 1: Eve lane command timeout" \
    env \
      UNIFIED_ROUTER_DEFAULT_PRIMARY=eve \
      UNIFIED_ROUTER_DEFAULT_FALLBACK=none \
      UNIFIED_ROUTER_FAIL_CLOSED=1 \
      UNIFIED_EVE_TASK_DISPATCH_SCRIPT="/bin/sleep" \
      UNIFIED_EVE_DISPATCH_TIMEOUT_MS=10 \
      node "$ROOT_DIR/dist/src/bin/unified-dispatch.js" --text "2" --chat-id "100" --message-id "1"

  run_case "Case 2: Hermes lane non-zero exit" \
    env \
      UNIFIED_ROUTER_DEFAULT_PRIMARY=hermes \
      UNIFIED_ROUTER_DEFAULT_FALLBACK=none \
      UNIFIED_ROUTER_FAIL_CLOSED=1 \
      UNIFIED_HERMES_LAUNCH_COMMAND="/bin/false" \
      UNIFIED_HERMES_LAUNCH_ARGS= \
      node "$ROOT_DIR/dist/src/bin/unified-dispatch.js" --text "hermes fail case" --chat-id "100" --message-id "2"

  run_case "Case 3: Synthetic provider-limit mapping" \
    env \
      UNIFIED_ROUTER_DEFAULT_PRIMARY=hermes \
      UNIFIED_ROUTER_DEFAULT_FALLBACK=none \
      UNIFIED_ROUTER_FAIL_CLOSED=1 \
      UNIFIED_HERMES_LAUNCH_COMMAND="/bin/sh" \
      UNIFIED_HERMES_LAUNCH_ARGS="-c printf 'provider_limit\\n' 1>&2; exit 1" \
      node "$ROOT_DIR/dist/src/bin/unified-dispatch.js" --text "provider limit simulation" --chat-id "100" --message-id "3"

  run_case "Case 4: Dispatch-state read mismatch" \
    env \
      UNIFIED_ROUTER_DEFAULT_PRIMARY=eve \
      UNIFIED_ROUTER_DEFAULT_FALLBACK=none \
      UNIFIED_ROUTER_FAIL_CLOSED=1 \
      UNIFIED_EVE_TASK_DISPATCH_SCRIPT="/bin/true" \
      UNIFIED_EVE_DISPATCH_RESULT_PATH="/tmp/unified-missing-eve-state-${timestamp}.json" \
      node "$ROOT_DIR/dist/src/bin/unified-dispatch.js" --text "state mismatch case" --chat-id "100" --message-id "4"

  run_case "Case 5: Policy fail-closed path with no fallback" \
    env \
      UNIFIED_ROUTER_DEFAULT_PRIMARY=eve \
      UNIFIED_ROUTER_DEFAULT_FALLBACK=none \
      UNIFIED_ROUTER_FAIL_CLOSED=1 \
      UNIFIED_CAPABILITY_POLICY_DEFAULT=deny \
      node "$ROOT_DIR/dist/src/bin/unified-dispatch.js" --text "@cap summarize_state denied" --chat-id "100" --message-id "5"

  echo "Failure injection smoke ended: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} >"$report" 2>&1

echo "Wrote $report"
