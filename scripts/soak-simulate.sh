#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export EVE_TASK_DISPATCH_SCRIPT="${EVE_TASK_DISPATCH_SCRIPT:-$ROOT_DIR/scripts/ci-eve-dispatch-stub.sh}"
export EVE_DISPATCH_RESULT_PATH="${EVE_DISPATCH_RESULT_PATH:-/tmp/eve-hermes-unified-soak.json}"
export HERMES_LAUNCH_COMMAND="${HERMES_LAUNCH_COMMAND:-bash}"
export HERMES_LAUNCH_ARGS="${HERMES_LAUNCH_ARGS:-$ROOT_DIR/scripts/ci-hermes-dispatch-stub.sh}"

iterations="${1:-20}"
node "$ROOT_DIR/dist/src/bin/soak-simulate.js" --iterations "$iterations"
