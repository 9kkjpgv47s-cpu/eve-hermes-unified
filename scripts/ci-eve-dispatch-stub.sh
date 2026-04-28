#!/usr/bin/env bash
# CI/local stub: mimics eve-task-dispatch.sh contract for UnifiedMemoryStore / gateway drills.
set -euo pipefail
_out="${EVE_TASK_DISPATCH_RESULT_PATH:?EVE_TASK_DISPATCH_RESULT_PATH required}"
mkdir -p "$(dirname "$_out")"
_trace="${EVE_TASK_DISPATCH_TRACE_ID:-}"
_chat="${EVE_TASK_DISPATCH_CHAT_ID:-}"
_msg="${EVE_TASK_DISPATCH_MESSAGE_ID:-}"
_run="${EVE_TASK_DISPATCH_RUN_ID:-stub}"
cat >"$_out" <<EOF
{"status":"pass","reason":"ci_stub","runtime_used":"eve","run_id":"${_run}","elapsed_ms":1,"trace_id":"${_trace}","source_chat_id":"${_chat}","source_message_id":"${_msg}"}
EOF
exit 0
