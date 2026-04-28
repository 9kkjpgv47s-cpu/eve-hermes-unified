#!/usr/bin/env bash
# CI/local: one unified dispatch with stub Eve/Hermes, writes JSON transcript under evidence/.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVIDENCE="${UNIFIED_EVIDENCE_DIR:-$ROOT_DIR/evidence}"
export UNIFIED_EVIDENCE_DIR="$EVIDENCE"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

fake_eve="$tmp_dir/fake-eve.sh"
cat >"$fake_eve" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
result_path="${EVE_TASK_DISPATCH_RESULT_PATH:?}"
mkdir -p "$(dirname "$result_path")"
cat >"$result_path" <<JSON
{
  "status": "pass",
  "reason": "ci_transcript_stub",
  "runtime_used": "eve",
  "run_id": "${EVE_TASK_DISPATCH_RUN_ID:-run-ci}",
  "elapsed_ms": 1,
  "trace_id": "${EVE_TASK_DISPATCH_TRACE_ID:-trace-ci}",
  "source_chat_id": "${EVE_TASK_DISPATCH_CHAT_ID:-0}",
  "source_message_id": "${EVE_TASK_DISPATCH_MESSAGE_ID:-0}"
}
JSON
SCRIPT
chmod +x "$fake_eve"

export UNIFIED_PREFLIGHT_ENABLED="${UNIFIED_PREFLIGHT_ENABLED:-0}"
export UNIFIED_ROUTER_DEFAULT_PRIMARY="${UNIFIED_ROUTER_DEFAULT_PRIMARY:-eve}"
export UNIFIED_ROUTER_DEFAULT_FALLBACK="${UNIFIED_ROUTER_DEFAULT_FALLBACK:-hermes}"
export UNIFIED_ROUTER_FAIL_CLOSED="${UNIFIED_ROUTER_FAIL_CLOSED:-0}"
export UNIFIED_ROUTER_CUTOVER_STAGE="${UNIFIED_ROUTER_CUTOVER_STAGE:-full}"
export UNIFIED_MEMORY_STORE_KIND="${UNIFIED_MEMORY_STORE_KIND:-file}"
export UNIFIED_MEMORY_FILE_PATH="${UNIFIED_MEMORY_FILE_PATH:-/tmp/eve-hermes-ci-transcript-memory.json}"
export EVE_TASK_DISPATCH_SCRIPT="$fake_eve"
export EVE_DISPATCH_RESULT_PATH="${EVE_DISPATCH_RESULT_PATH:-/tmp/eve-hermes-ci-transcript-eve.json}"
export HERMES_LAUNCH_COMMAND="${HERMES_LAUNCH_COMMAND:-/bin/true}"
export HERMES_LAUNCH_ARGS="${HERMES_LAUNCH_ARGS:-}"

mkdir -p "$EVIDENCE"
stamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
out="$EVIDENCE/unified-dispatch-transcript-${stamp}.json"

dispatch_bin="${UNIFIED_DISPATCH_BIN:-$ROOT_DIR/dist/src/bin/unified-dispatch.js}"
dispatch_cmd=()
if [[ -f "$dispatch_bin" ]]; then
  dispatch_cmd=(node "$dispatch_bin")
elif [[ -x "$ROOT_DIR/node_modules/.bin/tsx" && -f "$ROOT_DIR/src/bin/unified-dispatch.ts" ]]; then
  dispatch_cmd=("$ROOT_DIR/node_modules/.bin/tsx" "$ROOT_DIR/src/bin/unified-dispatch.ts")
else
  echo "Missing dispatch runner. Run npm run build or ensure tsx + src/bin/unified-dispatch.ts exist." >&2
  exit 70
fi

"${dispatch_cmd[@]}" --text "ci dispatch transcript" --chat-id "ci" --message-id "1" >"$out"
npx --no-install tsx "$ROOT_DIR/src/bin/validate-dispatch-contracts.ts" --file "$out"
echo "Wrote $out"
