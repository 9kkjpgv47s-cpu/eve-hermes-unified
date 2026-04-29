#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${UNIFIED_EVIDENCE_DIR:-$ROOT_DIR/evidence}"
mkdir -p "$OUT_DIR"

iterations="${1:-20}"
report="$OUT_DIR/soak-$(date +%Y%m%d-%H%M%S).jsonl"
metrics_out="${UNIFIED_SOAK_METRICS_OUT:-$OUT_DIR/soak-latest-metrics.json}"
soak_start_ms="$(date +%s%3N)"
chat_id="${UNIFIED_SOAK_CHAT_ID:-777}"
eve_dispatch_script="${UNIFIED_SOAK_EVE_DISPATCH_SCRIPT:-/bin/true}"
hermes_launch_command="${UNIFIED_SOAK_HERMES_LAUNCH_COMMAND:-/bin/true}"
eve_dispatch_result_path="${UNIFIED_SOAK_EVE_DISPATCH_RESULT_PATH:-$OUT_DIR/soak-eve-dispatch-state.json}"

dispatch_bin="${UNIFIED_DISPATCH_BIN:-$ROOT_DIR/dist/src/bin/unified-dispatch.js}"
dispatch_cmd=()
if [[ -f "$dispatch_bin" ]]; then
  dispatch_cmd=(node "$dispatch_bin")
elif [[ -x "$ROOT_DIR/node_modules/.bin/tsx" && -f "$ROOT_DIR/src/bin/unified-dispatch.ts" ]]; then
  dispatch_cmd=("$ROOT_DIR/node_modules/.bin/tsx" "$ROOT_DIR/src/bin/unified-dispatch.ts")
else
  echo "Missing dispatch runner. Expected dist binary or local tsx install." >&2
  echo "Run npm install and optionally npm run build before soak simulation." >&2
  exit 70
fi

for i in $(seq 1 "$iterations"); do
  if (( i % 3 == 0 )); then
    text="@cap summarize_state staged-health-$i"
  elif (( i % 2 == 0 )); then
    text="@hermes status $i"
  else
    text="normal message $i"
  fi

  env \
    UNIFIED_ROUTER_DEFAULT_PRIMARY=hermes \
    UNIFIED_ROUTER_DEFAULT_FALLBACK=none \
    UNIFIED_ROUTER_FAIL_CLOSED=1 \
    UNIFIED_ROUTER_CUTOVER_STAGE="${UNIFIED_SOAK_CUTOVER_STAGE:-shadow}" \
    UNIFIED_EVE_TASK_DISPATCH_SCRIPT="$eve_dispatch_script" \
    EVE_TASK_DISPATCH_SCRIPT="$eve_dispatch_script" \
    UNIFIED_EVE_DISPATCH_RESULT_PATH="$eve_dispatch_result_path" \
    EVE_DISPATCH_RESULT_PATH="$eve_dispatch_result_path" \
    UNIFIED_HERMES_LAUNCH_COMMAND="$hermes_launch_command" \
    HERMES_LAUNCH_COMMAND="$hermes_launch_command" \
    UNIFIED_HERMES_LAUNCH_ARGS= \
    HERMES_LAUNCH_ARGS= \
    "${dispatch_cmd[@]}" --compact-json --text "$text" --chat-id "$chat_id" --message-id "$i" >>"$report" 2>&1 || true
done

soak_end_ms="$(date +%s%3N)"
export UNIFIED_SOAK_WALL_MS="$((soak_end_ms - soak_start_ms))"

echo "Wrote $report"

node "$ROOT_DIR/scripts/ci-soak-metrics-from-jsonl.mjs" --input "$report" --out "$metrics_out"

if [[ "${UNIFIED_SOAK_RUN_SLO_GATE:-1}" != "0" ]]; then
  export UNIFIED_SOAK_MIN_SUCCESS_RATE="${UNIFIED_SOAK_MIN_SUCCESS_RATE:-0.90}"
  export UNIFIED_SOAK_MAX_MISSING_TRACE_RATE="${UNIFIED_SOAK_MAX_MISSING_TRACE_RATE:-0.10}"
  export UNIFIED_SOAK_MAX_UNCLASSIFIED_FAILURES="${UNIFIED_SOAK_MAX_UNCLASSIFIED_FAILURES:-50}"
  export UNIFIED_SOAK_MAX_P95_LATENCY_MS="${UNIFIED_SOAK_MAX_P95_LATENCY_MS:-10000}"
  export UNIFIED_SOAK_MAX_DISPATCH_FAILURE_RATE="${UNIFIED_SOAK_MAX_DISPATCH_FAILURE_RATE:-0.35}"
  export UNIFIED_SOAK_MAX_POLICY_FAILURE_RATE="${UNIFIED_SOAK_MAX_POLICY_FAILURE_RATE:-0.35}"
  node "$ROOT_DIR/scripts/ci-soak-slo-gate.mjs" --metrics "$metrics_out"
fi

if [[ "${UNIFIED_SOAK_SUMMARIZE:-0}" == "1" ]]; then
  node "$ROOT_DIR/scripts/summarize-soak-report.mjs" "$report" || true
fi
