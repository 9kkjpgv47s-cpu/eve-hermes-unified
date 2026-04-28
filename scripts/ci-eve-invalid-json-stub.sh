#!/usr/bin/env bash
set -euo pipefail
_out="${EVE_TASK_DISPATCH_RESULT_PATH:?}"
mkdir -p "$(dirname "$_out")"
echo 'not json at all' >"$_out"
exit 0
