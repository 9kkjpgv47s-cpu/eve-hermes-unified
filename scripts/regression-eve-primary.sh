#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${UNIFIED_EVIDENCE_DIR:-$ROOT_DIR/evidence}"
mkdir -p "$OUT_DIR"

timestamp="$(date +%Y%m%d-%H%M%S)"
report="$OUT_DIR/regression-eve-primary-$timestamp.json"
iterations="${UNIFIED_REGRESSION_EVE_ITERATIONS:-4}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --summary-out)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --summary-out" >&2
        exit 71
      fi
      report="$2"
      shift 2
      ;;
    --iterations)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --iterations" >&2
        exit 72
      fi
      iterations="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 73
      ;;
  esac
done
mkdir -p "$(dirname "$report")"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

fake_eve_script="$tmp_dir/fake-eve-dispatch.sh"
cat >"$fake_eve_script" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
result_path="${EVE_TASK_DISPATCH_RESULT_PATH:?missing result path}"
cat >"$result_path" <<JSON
{
  "status": "pass",
  "reason": "eve_dispatch_success",
  "runtime_used": "eve",
  "run_id": "${EVE_TASK_DISPATCH_RUN_ID:-run-eve-fake}",
  "elapsed_ms": 1,
  "trace_id": "${EVE_TASK_DISPATCH_TRACE_ID:-trace-fake}",
  "source_chat_id": "${EVE_TASK_DISPATCH_CHAT_ID:-0}",
  "source_message_id": "${EVE_TASK_DISPATCH_MESSAGE_ID:-0}"
}
JSON
SCRIPT
chmod +x "$fake_eve_script"

dispatch_bin="${UNIFIED_DISPATCH_BIN:-$ROOT_DIR/dist/src/bin/unified-dispatch.js}"
dispatch_cmd=()
if [[ -f "$dispatch_bin" ]]; then
  dispatch_cmd=(node "$dispatch_bin")
elif [[ -x "$ROOT_DIR/node_modules/.bin/tsx" && -f "$ROOT_DIR/src/bin/unified-dispatch.ts" ]]; then
  dispatch_cmd=("$ROOT_DIR/node_modules/.bin/tsx" "$ROOT_DIR/src/bin/unified-dispatch.ts")
else
  echo "Missing dispatch runner. Expected dist binary or local tsx install." >&2
  echo "Run npm install and optionally npm run build before regression checks." >&2
  exit 70
fi

run_dispatch() {
  local output_path="$1"
  local text="$2"
  local chat_id="$3"
  local message_id="$4"
  shift 4
  env \
    UNIFIED_ROUTER_DEFAULT_PRIMARY=eve \
    UNIFIED_ROUTER_DEFAULT_FALLBACK=none \
    UNIFIED_ROUTER_FAIL_CLOSED=1 \
    UNIFIED_ROUTER_CUTOVER_STAGE=shadow \
    UNIFIED_EVE_TASK_DISPATCH_SCRIPT="$fake_eve_script" \
    EVE_TASK_DISPATCH_SCRIPT="$fake_eve_script" \
    UNIFIED_EVE_DISPATCH_RESULT_PATH="$tmp_dir/eve-state.json" \
    EVE_DISPATCH_RESULT_PATH="$tmp_dir/eve-state.json" \
    UNIFIED_HERMES_LAUNCH_COMMAND="/bin/true" \
    HERMES_LAUNCH_COMMAND="/bin/true" \
    UNIFIED_HERMES_LAUNCH_ARGS= \
    HERMES_LAUNCH_ARGS= \
    "$@" \
    "${dispatch_cmd[@]}" --compact-json --text "$text" --chat-id "$chat_id" --message-id "$message_id" >"$output_path"
}

assert_dispatch() {
  local name="$1"
  local output_path="$2"
  local expected_lane="$3"
  local expected_reason="$4"
  local expected_failure="$5"
  node - "$output_path" "$expected_lane" "$expected_reason" "$expected_failure" <<'NODE'
const fs = require("node:fs");
const outputPath = process.argv[2];
const expectedLane = process.argv[3];
const expectedReason = process.argv[4];
const expectedFailure = process.argv[5];

const payload = JSON.parse(fs.readFileSync(outputPath, "utf8"));
const lane = payload?.primaryState?.sourceLane;
const reason = payload?.routing?.reason;
const failureClass = payload?.response?.failureClass;

if (lane !== expectedLane || reason !== expectedReason || failureClass !== expectedFailure) {
  process.stderr.write(
    `assertion_failed lane=${lane} reason=${reason} failure=${failureClass} expected_lane=${expectedLane} expected_reason=${expectedReason} expected_failure=${expectedFailure}\n`,
  );
  process.exit(1);
}
NODE
}

declare -a failures=()
declare -a case_records=()

run_case() {
  local name="$1"
  local text="$2"
  local chat_id="$3"
  local message_id="$4"
  local expected_lane="$5"
  local expected_reason="$6"
  local expected_failure="$7"
  shift 7
  local output_path="$tmp_dir/${name}.json"

  if ! run_dispatch "$output_path" "$text" "$chat_id" "$message_id" "$@"; then
    failures+=("${name}:dispatch_command_failed")
    return
  fi
  if ! assert_dispatch "$name" "$output_path" "$expected_lane" "$expected_reason" "$expected_failure"; then
    failures+=("${name}:assertion_failed")
    return
  fi
  if [[ "${UNIFIED_REGRESSION_VALIDATE_DISPATCH_CONTRACT:-1}" != "0" ]]; then
    if ! npx --no-install tsx "$ROOT_DIR/src/bin/validate-dispatch-contracts.ts" --file "$output_path" >/dev/null; then
      failures+=("${name}:dispatch_contract_validation_failed")
      return
    fi
  fi
  case_records+=("$name")
}

run_case "default_eve_primary" "regression baseline" "100" "1" "eve" "stage_shadow_default_primary" "none"
run_case "explicit_cursor_passthrough" "@cursor status baseline" "100" "2" "eve" "explicit_cursor_passthrough" "none"
run_case "explicit_hermes_override" "@hermes status baseline" "100" "3" "hermes" "explicit_hermes_passthrough" "none"
run_case "fail_closed_no_fallback_when_eve_fails" "eve failure regression" "100" "4" "eve" "stage_shadow_default_primary" "dispatch_failure" \
  UNIFIED_EVE_TASK_DISPATCH_SCRIPT="/bin/false"

if [[ "$iterations" =~ ^[0-9]+$ ]] && (( iterations > 4 )); then
  for i in $(seq 5 "$iterations"); do
    run_case "default_eve_primary_${i}" "regression baseline ${i}" "100" "$i" "eve" "stage_shadow_default_primary" "none"
  done
fi

python3 - <<'PY' "$report" "${#case_records[@]}" "${#failures[@]}" "$(printf '%s\n' "${case_records[@]}")" "$(printf '%s\n' "${failures[@]}")"
import json, sys
from datetime import datetime, timezone

report = sys.argv[1]
passed_count = int(sys.argv[2])
failed_count = int(sys.argv[3])
passed_raw = sys.argv[4].strip()
failed_raw = sys.argv[5].strip()

passed = [item for item in passed_raw.split("\n") if item]
failed = [item for item in failed_raw.split("\n") if item]

payload = {
    "generatedAtIso": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "pass": failed_count == 0,
    "requiredPrimaryLane": "eve",
    "requiredFallbackLane": "none",
    "totals": {
        "passed": passed_count,
        "failed": failed_count,
    },
    "passedCases": passed,
    "failedCases": failed,
}
with open(report, "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2)
    f.write("\n")
print(report)
if failed:
    for item in failed:
        print(item, file=sys.stderr)
    sys.exit(2)
PY
