#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export EVE_TASK_DISPATCH_SCRIPT="${EVE_TASK_DISPATCH_SCRIPT:-$ROOT_DIR/scripts/ci-eve-dispatch-stub.sh}"
export EVE_DISPATCH_RESULT_PATH="${EVE_DISPATCH_RESULT_PATH:-/tmp/eve-hermes-unified-soak-matrix.json}"
export HERMES_LAUNCH_COMMAND="${HERMES_LAUNCH_COMMAND:-bash}"
export HERMES_LAUNCH_ARGS="${HERMES_LAUNCH_ARGS:-$ROOT_DIR/scripts/ci-hermes-dispatch-stub.sh}"

ITER="${SOAK_MATRIX_ITERATIONS:-8}"
MIN_RATE="${UNIFIED_SOAK_MIN_SUCCESS_RATE:-0.99}"
MAX_WALL="${UNIFIED_SOAK_MAX_WALL_MS:-60000}"
MAX_P95_WALL="${UNIFIED_SOAK_MAX_P95_WALL_MS:-30000}"
MAX_P95_LANE="${UNIFIED_SOAK_MAX_P95_LANE_MS:-30000}"

run_stage() {
  local backend="$1"
  local memfile="$2"
  echo "=== soak matrix: UNIFIED_MEMORY_BACKEND=${backend} ==="
  UNIFIED_MEMORY_BACKEND="$backend" \
  UNIFIED_MEMORY_FILE_PATH="$memfile" \
  node "$ROOT_DIR/dist/src/bin/soak-simulate.js" --iterations "$ITER"
  shopt -s nullglob
  local files=("$ROOT_DIR/evidence"/soak-metrics-*.json)
  shopt -u nullglob
  if [[ ${#files[@]} -eq 0 ]]; then
    echo "No metrics file found" >&2
    exit 1
  fi
  local MET
  MET="$(ls -t "${files[@]}" | head -1)"
  UNIFIED_SOAK_MIN_SUCCESS_RATE="$MIN_RATE" \
  UNIFIED_SOAK_MAX_WALL_MS="$MAX_WALL" \
  UNIFIED_SOAK_MAX_P95_WALL_MS="$MAX_P95_WALL" \
  UNIFIED_SOAK_MAX_P95_LANE_MS="$MAX_P95_LANE" \
  node "$ROOT_DIR/dist/src/bin/ci-slo-gate-soak.js" --metrics-file "$MET"
}

mkdir -p "$ROOT_DIR/evidence"
run_stage "memory" "memory/unified-soak-matrix.json"
run_stage "file" "evidence/soak-matrix-file-memory.json"
echo "Soak matrix complete."
