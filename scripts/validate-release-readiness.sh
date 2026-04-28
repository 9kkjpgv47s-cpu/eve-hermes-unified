#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${UNIFIED_EVIDENCE_DIR:-$ROOT_DIR/evidence}"
mkdir -p "$OUT_DIR"

SUMMARY_PATH="${UNIFIED_RELEASE_READINESS_SUMMARY_PATH:-${UNIFIED_RELEASE_READINESS_REPORT_PATH:-$OUT_DIR/release-readiness-$(date +%Y%m%d-%H%M%S).json}}"
COMMAND_LOG_DIR="${UNIFIED_RELEASE_READINESS_COMMAND_LOG_DIR:-$OUT_DIR/release-readiness-command-logs-$(date +%Y%m%d-%H%M%S)}"
COMMANDS_FILE="${UNIFIED_RELEASE_READINESS_COMMANDS_FILE:-$COMMAND_LOG_DIR/commands.json}"
GOAL_POLICY_VALIDATION_REPORT_PATH="${UNIFIED_RELEASE_READINESS_GOAL_POLICY_VALIDATION_REPORT_PATH:-$OUT_DIR/goal-policy-file-validation-$(date +%Y%m%d-%H%M%S).json}"
REQUIRE_GOAL_POLICY_SOURCE_CONSISTENCY_FLAG=""
if [[ "${UNIFIED_RELEASE_READINESS_REQUIRE_GOAL_POLICY_SOURCE_CONSISTENCY:-1}" == "1" ]]; then
  REQUIRE_GOAL_POLICY_SOURCE_CONSISTENCY_FLAG="--require-goal-policy-source-consistency"
fi
mkdir -p "$COMMAND_LOG_DIR"
printf '[]\n' >"$COMMANDS_FILE"

declare -a required_command_names=()
declare -a used_log_file_basenames=()

sanitize_step_name() {
  local raw="$1"
  local normalized
  normalized="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]')"
  normalized="$(printf '%s' "$normalized" | sed -E 's/[^a-z0-9._-]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g')"
  if [[ -z "$normalized" ]]; then
    normalized="step"
  fi
  local candidate="$normalized"
  local suffix=2
  while [[ " ${used_log_file_basenames[*]} " == *" ${candidate} "* ]]; do
    candidate="${normalized}-${suffix}"
    suffix=$((suffix + 1))
  done
  used_log_file_basenames+=("$candidate")
  printf '%s\n' "$candidate"
}

append_command_result() {
  local name="$1"
  local command_display="$2"
  local log_file="$3"
  local status="$4"
  local exit_code="$5"
  local started_at="$6"
  local finished_at="$7"
  node - "$COMMANDS_FILE" "$name" "$command_display" "$log_file" "$status" "$exit_code" "$started_at" "$finished_at" <<'NODE'
const fs = require("node:fs");
const commandsPath = process.argv[2];
const record = {
  name: process.argv[3],
  command: process.argv[4],
  logFile: process.argv[5],
  status: process.argv[6],
  exitCode: Number(process.argv[7]),
  startedAtIso: process.argv[8],
  finishedAtIso: process.argv[9],
};
const existing = JSON.parse(fs.readFileSync(commandsPath, "utf8"));
if (!Array.isArray(existing)) {
  throw new Error("commands file payload must be an array");
}
existing.push(record);
fs.writeFileSync(commandsPath, `${JSON.stringify(existing, null, 2)}\n`, "utf8");
NODE
}

run_step() {
  local name="$1"
  shift
  local safe_name
  safe_name="$(sanitize_step_name "$name")"
  local log_file="$COMMAND_LOG_DIR/${safe_name}.log"
  local started_at
  local finished_at
  local status
  local exit_code
  started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local command_display
  command_display="$*"
  status="failed"
  if "$@" >"$log_file" 2>&1; then
    status="passed"
    exit_code=0
  else
    exit_code=$?
  fi
  finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  append_command_result "$name" "$name" "$log_file" "$status" "$exit_code" "$started_at" "$finished_at"
  required_command_names+=("$name")
}

if [[ -z "${UNIFIED_RELEASE_READINESS_VALIDATE_ALL_COMMAND:-}" ]]; then
  validate_all_command=(npm --prefix "$ROOT_DIR" run validate:all)
else
  validate_all_command=(bash -lc "$UNIFIED_RELEASE_READINESS_VALIDATE_ALL_COMMAND")
fi

if [[ "${UNIFIED_RELEASE_READINESS_RUN_VALIDATE_ALL:-1}" == "1" ]]; then
  run_step "validate:all" "${validate_all_command[@]}"
else
  run_step "check" npm --prefix "$ROOT_DIR" run check
  if [[ "${UNIFIED_RELEASE_READINESS_SKIP_TEST:-0}" != "1" ]]; then
    run_step "test" npm --prefix "$ROOT_DIR" test
  fi
  run_step "build" npm --prefix "$ROOT_DIR" run build
  run_step "validate:failure-injection" npm --prefix "$ROOT_DIR" run validate:failure-injection
  run_step "validate:soak" npm --prefix "$ROOT_DIR" run validate:soak
  run_step "validate:evidence-summary" npm --prefix "$ROOT_DIR" run validate:evidence-summary
  run_step "validate:regression-eve" npm --prefix "$ROOT_DIR" run validate:regression-eve
  run_step "validate:cutover-readiness" npm --prefix "$ROOT_DIR" run validate:cutover-readiness
fi

if [[ "${UNIFIED_RELEASE_READINESS_RUN_GOAL_POLICY_FILE_VALIDATION:-1}" == "1" ]]; then
  run_step \
    "validate:goal-policy-file" \
    node \
    "$ROOT_DIR/scripts/validate-goal-policy-file.mjs" \
    --horizon-status-file "$ROOT_DIR/docs/HORIZON_STATUS.json" \
    --goal-policy-file "$ROOT_DIR/docs/GOAL_POLICIES.json" \
    --source-horizon H2 \
    --until-horizon H7 \
    --require-tagged-requirements \
    --require-positive-pending-min \
    $REQUIRE_GOAL_POLICY_SOURCE_CONSISTENCY_FLAG \
    --out "$GOAL_POLICY_VALIDATION_REPORT_PATH"
fi

required_joined=""
if [[ "${#required_command_names[@]}" -gt 0 ]]; then
  required_joined="$(printf "%s," "${required_command_names[@]}")"
  required_joined="${required_joined%,}"
fi

release_readiness_cmd=(
  node "$ROOT_DIR/scripts/release-readiness.mjs"
  --evidence-dir "$OUT_DIR"
  --out "$SUMMARY_PATH"
  --command-log-dir "$COMMAND_LOG_DIR"
  --commands-file "$COMMANDS_FILE"
  --goal-policy-file-validation-report "$GOAL_POLICY_VALIDATION_REPORT_PATH"
)
if [[ "${UNIFIED_RELEASE_READINESS_REQUIRE_GOAL_POLICY_FILE_VALIDATION_REPORT:-1}" != "1" ]]; then
  release_readiness_cmd+=("--allow-missing-goal-policy-file-validation-report")
fi
if [[ "${UNIFIED_RELEASE_READINESS_REQUIRE_GOAL_POLICY_SOURCE_CONSISTENCY:-1}" != "1" ]]; then
  release_readiness_cmd+=("--allow-missing-goal-policy-source-consistency-report")
fi
if [[ -n "$required_joined" ]]; then
  release_readiness_cmd+=("--required-command-names" "$required_joined")
fi
"${release_readiness_cmd[@]}"

echo "Wrote $SUMMARY_PATH"
