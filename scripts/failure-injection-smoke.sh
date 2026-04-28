#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${UNIFIED_EVIDENCE_DIR:-$ROOT_DIR/evidence}"
mkdir -p "$OUT_DIR"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

dispatch_bin="${UNIFIED_DISPATCH_BIN:-$ROOT_DIR/dist/src/bin/unified-dispatch.js}"
dispatch_cmd=()
if [[ -f "$dispatch_bin" ]]; then
  dispatch_cmd=(node "$dispatch_bin")
elif [[ -x "$ROOT_DIR/node_modules/.bin/tsx" && -f "$ROOT_DIR/src/bin/unified-dispatch.ts" ]]; then
  dispatch_cmd=("$ROOT_DIR/node_modules/.bin/tsx" "$ROOT_DIR/src/bin/unified-dispatch.ts")
else
  echo "Missing dispatch runner. Expected dist binary or local tsx install." >&2
  echo "Run npm install and optionally npm run build before failure injection smoke." >&2
  exit 70
fi

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

timestamp="$(date +%Y%m%d-%H%M%S)"
report="$OUT_DIR/failure-injection-$timestamp.txt"

sanitize_label() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9._-]+/-/g; s/^-+//; s/-+$//'
}

run_case() {
  local label="$1"
  shift
  echo "==== $label ===="
  local safe
  safe="$(sanitize_label "$label")"
  local json_out="$tmp_dir/case-${safe}.json"
  local err_out="$tmp_dir/case-${safe}.err"
  set +e
  "$@" >"$json_out" 2>"$err_out"
  set -e
  if [[ "${UNIFIED_FAILURE_INJECTION_VALIDATE_DISPATCH_CONTRACT:-1}" != "0" ]]; then
    npx --no-install tsx "$ROOT_DIR/src/bin/validate-dispatch-contracts.ts" --file "$json_out" >/dev/null
  fi
  cat "$json_out"
  if [[ -s "$err_out" ]]; then
    cat "$err_out"
  fi
  echo
}

{
  echo "Failure injection smoke started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  run_case "Case 1: Eve lane command timeout" \
    env \
      UNIFIED_PREFLIGHT_ENABLED=0 \
      PREFLIGHT_ENABLED=0 \
      UNIFIED_ROUTER_DEFAULT_PRIMARY=eve \
      UNIFIED_ROUTER_DEFAULT_FALLBACK=none \
      UNIFIED_ROUTER_FAIL_CLOSED=1 \
      UNIFIED_EVE_TASK_DISPATCH_SCRIPT="/bin/sleep" \
      UNIFIED_EVE_DISPATCH_TIMEOUT_MS=10 \
      "${dispatch_cmd[@]}" --text "2" --chat-id "100" --message-id "1"

  run_case "Case 2: Hermes lane non-zero exit" \
    env \
      UNIFIED_PREFLIGHT_ENABLED=0 \
      PREFLIGHT_ENABLED=0 \
      UNIFIED_ROUTER_DEFAULT_PRIMARY=hermes \
      UNIFIED_ROUTER_DEFAULT_FALLBACK=none \
      UNIFIED_ROUTER_FAIL_CLOSED=1 \
      UNIFIED_EVE_TASK_DISPATCH_SCRIPT="$fake_eve_script" \
      EVE_TASK_DISPATCH_SCRIPT="$fake_eve_script" \
      UNIFIED_EVE_DISPATCH_RESULT_PATH="$tmp_dir/eve-state.json" \
      EVE_DISPATCH_RESULT_PATH="$tmp_dir/eve-state.json" \
      UNIFIED_HERMES_LAUNCH_COMMAND="/bin/false" \
      UNIFIED_HERMES_LAUNCH_ARGS= \
      "${dispatch_cmd[@]}" --text "hermes fail case" --chat-id "100" --message-id "2"

  run_case "Case 3: Synthetic provider-limit mapping" \
    env \
      UNIFIED_PREFLIGHT_ENABLED=0 \
      PREFLIGHT_ENABLED=0 \
      UNIFIED_ROUTER_DEFAULT_PRIMARY=hermes \
      UNIFIED_ROUTER_DEFAULT_FALLBACK=none \
      UNIFIED_ROUTER_FAIL_CLOSED=1 \
      UNIFIED_EVE_TASK_DISPATCH_SCRIPT="$fake_eve_script" \
      EVE_TASK_DISPATCH_SCRIPT="$fake_eve_script" \
      UNIFIED_EVE_DISPATCH_RESULT_PATH="$tmp_dir/eve-state.json" \
      EVE_DISPATCH_RESULT_PATH="$tmp_dir/eve-state.json" \
      UNIFIED_HERMES_LAUNCH_COMMAND="/bin/sh" \
      UNIFIED_HERMES_LAUNCH_ARGS="-c printf 'provider_limit\\n' 1>&2; exit 1" \
      "${dispatch_cmd[@]}" --text "provider limit simulation" --chat-id "100" --message-id "3"

  run_case "Case 4: Dispatch-state read mismatch" \
    env \
      UNIFIED_PREFLIGHT_ENABLED=0 \
      PREFLIGHT_ENABLED=0 \
      UNIFIED_ROUTER_DEFAULT_PRIMARY=eve \
      UNIFIED_ROUTER_DEFAULT_FALLBACK=none \
      UNIFIED_ROUTER_FAIL_CLOSED=1 \
      UNIFIED_EVE_TASK_DISPATCH_SCRIPT="/bin/true" \
      UNIFIED_EVE_DISPATCH_RESULT_PATH="/tmp/unified-missing-eve-state-${timestamp}.json" \
      "${dispatch_cmd[@]}" --text "state mismatch case" --chat-id "100" --message-id "4"

  run_case "Case 5: Policy fail-closed path with no fallback" \
    env \
      UNIFIED_PREFLIGHT_ENABLED=0 \
      PREFLIGHT_ENABLED=0 \
      UNIFIED_ROUTER_DEFAULT_PRIMARY=eve \
      UNIFIED_ROUTER_DEFAULT_FALLBACK=none \
      UNIFIED_ROUTER_FAIL_CLOSED=1 \
      UNIFIED_EVE_TASK_DISPATCH_SCRIPT="$fake_eve_script" \
      EVE_TASK_DISPATCH_SCRIPT="$fake_eve_script" \
      UNIFIED_EVE_DISPATCH_RESULT_PATH="$tmp_dir/eve-state.json" \
      EVE_DISPATCH_RESULT_PATH="$tmp_dir/eve-state.json" \
      UNIFIED_CAPABILITY_POLICY_DEFAULT=deny \
      "${dispatch_cmd[@]}" --text "@cap summarize_state denied" --chat-id "100" --message-id "5"

  echo "Failure injection smoke ended: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} >"$report" 2>&1

echo "Wrote $report"
