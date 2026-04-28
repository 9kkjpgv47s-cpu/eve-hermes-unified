#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVIDENCE="${UNIFIED_EVIDENCE_DIR:-$ROOT_DIR/evidence}"
export UNIFIED_EVIDENCE_DIR="$EVIDENCE"
export EVE_TASK_DISPATCH_SCRIPT="$ROOT_DIR/scripts/ci-eve-dispatch-stub.sh"
export EVE_DISPATCH_RESULT_PATH="${EVE_DISPATCH_RESULT_PATH:-/tmp/eve-hermes-unified-ci-dispatch.json}"
export HERMES_LAUNCH_COMMAND=bash
export HERMES_LAUNCH_ARGS="$ROOT_DIR/scripts/ci-hermes-dispatch-stub.sh"
export UNIFIED_ROUTER_DEFAULT_PRIMARY=eve
export UNIFIED_ROUTER_DEFAULT_FALLBACK=hermes
export UNIFIED_ROUTER_FAIL_CLOSED=0
export UNIFIED_TELEGRAM_GATEWAY_MODE=unified
export UNIFIED_MEMORY_BACKEND=file
export UNIFIED_MEMORY_FILE_PATH="$EVIDENCE/ci-unified-memory.json"

mkdir -p "$EVIDENCE"
node "$ROOT_DIR/dist/src/bin/telegram-gateway.js" --text "ci gateway smoke" --chat-id "ci" --message-id "1"
echo "Evidence dir: $EVIDENCE"
