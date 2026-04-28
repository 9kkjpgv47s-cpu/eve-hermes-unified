#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${UNIFIED_EVIDENCE_DIR:-$ROOT_DIR/evidence}"
mkdir -p "$OUT_DIR"

iterations="${1:-20}"
report="$OUT_DIR/soak-$(date +%Y%m%d-%H%M%S).jsonl"
metrics_out="${UNIFIED_SOAK_METRICS_OUT:-$OUT_DIR/soak-latest-metrics.json}"
run_slo_gate="${UNIFIED_SOAK_RUN_SLO_GATE:-1}"
cutover_stage="${UNIFIED_SOAK_CUTOVER_STAGE:-shadow}"
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

if ms_start=$(date +%s%3N 2>/dev/null) && [[ "$ms_start" =~ ^[0-9]+$ ]]; then
  soak_start_ms="$ms_start"
else
  soak_start_ms=$(($(date +%s) * 1000))
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
    UNIFIED_ROUTER_CUTOVER_STAGE="$cutover_stage" \
    UNIFIED_EVE_TASK_DISPATCH_SCRIPT="$eve_dispatch_script" \
    EVE_TASK_DISPATCH_SCRIPT="$eve_dispatch_script" \
    UNIFIED_EVE_DISPATCH_RESULT_PATH="$eve_dispatch_result_path" \
    EVE_DISPATCH_RESULT_PATH="$eve_dispatch_result_path" \
    UNIFIED_HERMES_LAUNCH_COMMAND="$hermes_launch_command" \
    HERMES_LAUNCH_COMMAND="$hermes_launch_command" \
    UNIFIED_HERMES_LAUNCH_ARGS= \
    HERMES_LAUNCH_ARGS= \
    "${dispatch_cmd[@]}" --text "$text" --chat-id "$chat_id" --message-id "$i" >>"$report" 2>&1 || true
done

if ms_end=$(date +%s%3N 2>/dev/null) && [[ "$ms_end" =~ ^[0-9]+$ ]]; then
  soak_end_ms="$ms_end"
else
  soak_end_ms=$(($(date +%s) * 1000))
fi
wall_ms=$((soak_end_ms - soak_start_ms))
if (( wall_ms < 0 )); then
  wall_ms=0
fi

export UNIFIED_SOAK_WALL_MS="$wall_ms"
node "$ROOT_DIR/scripts/ci-soak-metrics-from-jsonl.mjs" --in "$report" --out "$metrics_out"
echo "Wrote $report"
echo "Wrote $metrics_out (wallClockMs=$wall_ms, cutoverStage=$cutover_stage)"

if [[ "$run_slo_gate" == "1" ]]; then
  node "$ROOT_DIR/scripts/ci-soak-slo-gate.mjs" --metrics "$metrics_out"
fi
