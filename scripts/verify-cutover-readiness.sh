#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${UNIFIED_EVIDENCE_DIR:-$ROOT_DIR/evidence}"
mkdir -p "$OUT_DIR"

timestamp="$(date +%Y%m%d-%H%M%S)"
report="$OUT_DIR/cutover-readiness-$timestamp.json"
if [[ -n "${UNIFIED_CUTOVER_READINESS_REPORT_PATH:-}" ]]; then
  report="$UNIFIED_CUTOVER_READINESS_REPORT_PATH"
fi

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

env_file="$tmp_dir/gateway.env"
cat >"$env_file" <<'EOF'
UNIFIED_ROUTER_DEFAULT_PRIMARY=eve
UNIFIED_ROUTER_DEFAULT_FALLBACK=hermes
UNIFIED_ROUTER_FAIL_CLOSED=1
UNIFIED_ROUTER_CUTOVER_STAGE=shadow
UNIFIED_ROUTER_CANARY_CHAT_IDS=
UNIFIED_ROUTER_MAJORITY_PERCENT=0
EOF

run_dispatch_json() {
  local text="$1"
  local chat_id="$2"
  local message_id="$3"
  local dispatch_runner
  local dispatch_entry
  if [[ -f "$ROOT_DIR/dist/src/bin/unified-dispatch.js" ]]; then
    dispatch_runner=(node)
    dispatch_entry="$ROOT_DIR/dist/src/bin/unified-dispatch.js"
  elif [[ -x "$ROOT_DIR/node_modules/.bin/tsx" && -f "$ROOT_DIR/src/bin/unified-dispatch.ts" ]]; then
    # Keep readiness tests independent from build ordering in CI.
    dispatch_runner=("$ROOT_DIR/node_modules/.bin/tsx")
    dispatch_entry="$ROOT_DIR/src/bin/unified-dispatch.ts"
  else
    echo "Missing dispatch runner. Expected dist binary or local tsx install." >&2
    echo "Run npm install and optionally npm run build before cutover readiness checks." >&2
    exit 71
  fi
  UNIFIED_ROUTER_DEFAULT_PRIMARY="${UNIFIED_ROUTER_DEFAULT_PRIMARY:-eve}" \
  UNIFIED_ROUTER_DEFAULT_FALLBACK="${UNIFIED_ROUTER_DEFAULT_FALLBACK:-hermes}" \
  UNIFIED_ROUTER_FAIL_CLOSED="${UNIFIED_ROUTER_FAIL_CLOSED:-1}" \
  UNIFIED_ROUTER_CUTOVER_STAGE="${UNIFIED_ROUTER_CUTOVER_STAGE:-shadow}" \
  UNIFIED_ROUTER_CANARY_CHAT_IDS="${UNIFIED_ROUTER_CANARY_CHAT_IDS:-}" \
  UNIFIED_ROUTER_MAJORITY_PERCENT="${UNIFIED_ROUTER_MAJORITY_PERCENT:-0}" \
  HERMES_LAUNCH_COMMAND="${HERMES_LAUNCH_COMMAND:-/bin/true}" \
  HERMES_LAUNCH_ARGS="${HERMES_LAUNCH_ARGS:-}" \
  EVE_TASK_DISPATCH_SCRIPT="${EVE_TASK_DISPATCH_SCRIPT:-/bin/true}" \
  EVE_DISPATCH_RESULT_PATH="${EVE_DISPATCH_RESULT_PATH:-/tmp/eve-dispatch-result.json}" \
  UNIFIED_MEMORY_STORE_KIND="${UNIFIED_MEMORY_STORE_KIND:-file}" \
  UNIFIED_MEMORY_FILE_PATH="${UNIFIED_MEMORY_FILE_PATH:-/tmp/eve-hermes-unified-memory.json}" \
    "${dispatch_runner[@]}" "$dispatch_entry" --compact-json --text "$text" --chat-id "$chat_id" --message-id "$message_id"
}

validate_dispatch_contract_json() {
  local payload="$1"
  local scratch="$tmp_dir/contract-${RANDOM}.json"
  printf '%s' "$payload" >"$scratch"
  if [[ "${UNIFIED_CUTOVER_READINESS_VALIDATE_DISPATCH_CONTRACT:-1}" != "0" ]]; then
    npx --no-install tsx "$ROOT_DIR/src/bin/validate-dispatch-contracts.ts" --file "$scratch" >/dev/null
  fi
}

extract_json_field() {
  local json="$1"
  local expr="$2"
  node -e 'const d=JSON.parse(process.argv[1]); const e=process.argv[2].split("."); let v=d; for (const k of e) v=v?.[k]; process.stdout.write(String(v));' "$json" "$expr"
}

run_stage() {
  local stage="$1"
  shift
  UNIFIED_RUNTIME_ENV_FILE="$env_file" bash "$ROOT_DIR/scripts/prod-cutover-stage.sh" "$stage" "$@" >/dev/null

  export UNIFIED_ROUTER_DEFAULT_PRIMARY
  export UNIFIED_ROUTER_DEFAULT_FALLBACK
  export UNIFIED_ROUTER_FAIL_CLOSED
  export UNIFIED_ROUTER_CUTOVER_STAGE
  export UNIFIED_ROUTER_CANARY_CHAT_IDS
  export UNIFIED_ROUTER_MAJORITY_PERCENT
  while IFS= read -r line; do
    case "$line" in
      UNIFIED_ROUTER_DEFAULT_PRIMARY=*) UNIFIED_ROUTER_DEFAULT_PRIMARY="${line#*=}" ;;
      UNIFIED_ROUTER_DEFAULT_FALLBACK=*) UNIFIED_ROUTER_DEFAULT_FALLBACK="${line#*=}" ;;
      UNIFIED_ROUTER_FAIL_CLOSED=*) UNIFIED_ROUTER_FAIL_CLOSED="${line#*=}" ;;
      UNIFIED_ROUTER_CUTOVER_STAGE=*) UNIFIED_ROUTER_CUTOVER_STAGE="${line#*=}" ;;
      UNIFIED_ROUTER_CANARY_CHAT_IDS=*) UNIFIED_ROUTER_CANARY_CHAT_IDS="${line#*=}" ;;
      UNIFIED_ROUTER_MAJORITY_PERCENT=*) UNIFIED_ROUTER_MAJORITY_PERCENT="${line#*=}" ;;
    esac
  done <"$env_file"
}

build_stage_record() {
  local stage="$1"
  local chat_id="$2"
  local message_id="$3"
  local text="$4"
  local expected_lane="$5"
  local expected_prefix="$6"

  local json
  json="$(run_dispatch_json "$text" "$chat_id" "$message_id")"
  validate_dispatch_contract_json "$json"
  local lane reason fallback fail_closed
  lane="$(extract_json_field "$json" "routing.primaryLane")"
  reason="$(extract_json_field "$json" "routing.reason")"
  fallback="$(extract_json_field "$json" "routing.fallbackLane")"
  fail_closed="$(extract_json_field "$json" "routing.failClosed")"

  local pass="false"
  if [[ "$lane" == "$expected_lane" && "$reason" == "$expected_prefix" ]]; then
    pass="true"
  fi

  node -e '
const rec = {
  stage: process.argv[1],
  chatId: process.argv[2],
  messageId: process.argv[3],
  expectedLane: process.argv[4],
  expectedReason: process.argv[5],
  actualLane: process.argv[6],
  actualReason: process.argv[7],
  fallbackLane: process.argv[8],
  failClosed: process.argv[9] === "true",
  pass: process.argv[10] === "true",
};
process.stdout.write(JSON.stringify(rec));
' "$stage" "$chat_id" "$message_id" "$expected_lane" "$expected_prefix" "$lane" "$reason" "$fallback" "$fail_closed" "$pass"
}

run_stage shadow
shadow_record="$(build_stage_record shadow "shadow-chat" "1" "shadow stage probe" "eve" "stage_shadow_default_primary")"

run_stage canary --canary-chats "canary-chat"
canary_allow_record="$(build_stage_record canary "canary-chat" "2" "canary stage allow" "hermes" "stage_canary_allowlist")"
canary_default_record="$(build_stage_record canary "general-chat" "3" "canary stage default" "eve" "stage_canary_default_primary")"

run_stage majority --majority-percent 100
majority_full_record="$(build_stage_record majority "majority-chat" "4" "majority stage full" "hermes" "stage_majority_weighted")"

run_stage majority --majority-percent 0
majority_zero_record="$(build_stage_record majority "majority-chat" "5" "majority stage zero" "eve" "stage_majority_default_primary")"

run_stage full
full_record="$(build_stage_record full "full-chat" "6" "full stage probe" "hermes" "stage_full_force_hermes")"

UNIFIED_RUNTIME_ENV_FILE="$env_file" bash "$ROOT_DIR/scripts/prod-rollback-eve-safe-lane.sh" >/dev/null
while IFS= read -r line; do
  case "$line" in
    UNIFIED_ROUTER_DEFAULT_PRIMARY=*) UNIFIED_ROUTER_DEFAULT_PRIMARY="${line#*=}" ;;
    UNIFIED_ROUTER_DEFAULT_FALLBACK=*) UNIFIED_ROUTER_DEFAULT_FALLBACK="${line#*=}" ;;
    UNIFIED_ROUTER_FAIL_CLOSED=*) UNIFIED_ROUTER_FAIL_CLOSED="${line#*=}" ;;
    UNIFIED_ROUTER_CUTOVER_STAGE=*) UNIFIED_ROUTER_CUTOVER_STAGE="${line#*=}" ;;
    UNIFIED_ROUTER_CANARY_CHAT_IDS=*) UNIFIED_ROUTER_CANARY_CHAT_IDS="${line#*=}" ;;
    UNIFIED_ROUTER_MAJORITY_PERCENT=*) UNIFIED_ROUTER_MAJORITY_PERCENT="${line#*=}" ;;
  esac
done <"$env_file"

rollback_json="$(run_dispatch_json "rollback verification probe" "rollback-chat" "7")"
validate_dispatch_contract_json "$rollback_json"
rollback_lane="$(extract_json_field "$rollback_json" "routing.primaryLane")"
rollback_reason="$(extract_json_field "$rollback_json" "routing.reason")"

node -e '
const records = [
  JSON.parse(process.argv[1]),
  JSON.parse(process.argv[2]),
  JSON.parse(process.argv[3]),
  JSON.parse(process.argv[4]),
  JSON.parse(process.argv[5]),
  JSON.parse(process.argv[6]),
];
const rollback = {
  expected: {
    defaultPrimary: "eve",
    defaultFallback: "none",
    failClosed: "1",
    cutoverStage: "shadow",
    lane: "eve",
    reason: "stage_shadow_default_primary",
  },
  actual: {
    defaultPrimary: process.argv[7],
    defaultFallback: process.argv[8],
    failClosed: process.argv[9],
    cutoverStage: process.argv[10],
    canaryChats: process.argv[11],
    majorityPercent: process.argv[12],
    lane: process.argv[13],
    reason: process.argv[14],
  },
};
rollback.pass =
  rollback.actual.defaultPrimary === rollback.expected.defaultPrimary &&
  rollback.actual.defaultFallback === rollback.expected.defaultFallback &&
  rollback.actual.failClosed === rollback.expected.failClosed &&
  rollback.actual.cutoverStage === rollback.expected.cutoverStage &&
  rollback.actual.lane === rollback.expected.lane &&
  rollback.actual.reason === rollback.expected.reason;
const stagePass = records.every((record) => record.pass);
const pass = stagePass && rollback.pass;
const payload = {
  generatedAtIso: new Date().toISOString(),
  pass,
  stagePass,
  stageRecords: records,
  rollback,
};
process.stdout.write(JSON.stringify(payload, null, 2));
' "$shadow_record" "$canary_allow_record" "$canary_default_record" "$majority_full_record" "$majority_zero_record" "$full_record" "$UNIFIED_ROUTER_DEFAULT_PRIMARY" "$UNIFIED_ROUTER_DEFAULT_FALLBACK" "$UNIFIED_ROUTER_FAIL_CLOSED" "$UNIFIED_ROUTER_CUTOVER_STAGE" "$UNIFIED_ROUTER_CANARY_CHAT_IDS" "$UNIFIED_ROUTER_MAJORITY_PERCENT" "$rollback_lane" "$rollback_reason" >"$report"

echo "Wrote $report"
if ! node -e 'const fs=require("fs");const p=process.argv[1];const j=JSON.parse(fs.readFileSync(p,"utf8"));process.exit(j.pass?0:2);' "$report"; then
  echo "Cutover readiness verification failed" >&2
  exit 2
fi
