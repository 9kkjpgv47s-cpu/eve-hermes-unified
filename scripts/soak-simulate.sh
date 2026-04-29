#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${UNIFIED_EVIDENCE_DIR:-$ROOT_DIR/evidence}"
mkdir -p "$OUT_DIR"

# shellcheck source=scripts/unified-dispatch-runner.sh
source "$ROOT_DIR/scripts/unified-dispatch-runner.sh"
resolve_unified_dispatch || exit $?
dispatch_cmd=("${UNIFIED_DISPATCH_CMD[@]}")

iterations="${1:-20}"
report="$OUT_DIR/soak-$(date +%Y%m%d-%H%M%S).jsonl"
chat_id="${UNIFIED_SOAK_CHAT_ID:-777}"
eve_dispatch_script="${UNIFIED_SOAK_EVE_DISPATCH_SCRIPT:-/bin/true}"
hermes_launch_command="${UNIFIED_SOAK_HERMES_LAUNCH_COMMAND:-/bin/true}"
eve_dispatch_result_path="${UNIFIED_SOAK_EVE_DISPATCH_RESULT_PATH:-$OUT_DIR/soak-eve-dispatch-state.json}"

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
    UNIFIED_ROUTER_CUTOVER_STAGE=shadow \
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

echo "Wrote $report"

if [[ "${UNIFIED_SOAK_SUMMARIZE:-0}" == "1" ]]; then
  node "$ROOT_DIR/scripts/summarize-soak-report.mjs" "$report" || true
fi
