#!/usr/bin/env bash
# Resolve canonical unified-dispatch invocation for shell scripts (matches soak-simulate / regression paths).
# Sets UNIFIED_DISPATCH_CMD as a bash array: runner binary + entry path.
# Requires ROOT_DIR (repo root). Honors UNIFIED_DISPATCH_BIN when set to an existing file.
#
# Usage:
#   ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
#   # shellcheck source=scripts/unified-dispatch-runner.sh
#   source "$ROOT_DIR/scripts/unified-dispatch-runner.sh"
#   resolve_unified_dispatch || exit $?
#   env ... "${UNIFIED_DISPATCH_CMD[@]}" --text "..." --chat-id "1" --message-id "1"

resolve_unified_dispatch() {
  local root="${ROOT_DIR:-}"
  if [[ -z "$root" ]]; then
    echo "resolve_unified_dispatch: ROOT_DIR must be set" >&2
    return 70
  fi

  local dispatch_bin="${UNIFIED_DISPATCH_BIN:-$root/dist/src/bin/unified-dispatch.js}"
  if [[ -f "$dispatch_bin" ]]; then
    UNIFIED_DISPATCH_CMD=(node "$dispatch_bin")
    return 0
  fi

  local tsx="$root/node_modules/.bin/tsx"
  local entry="$root/src/bin/unified-dispatch.ts"
  if [[ -x "$tsx" && -f "$entry" ]]; then
    UNIFIED_DISPATCH_CMD=("$tsx" "$entry")
    return 0
  fi

  echo "Missing dispatch runner. Expected dist binary or local tsx install." >&2
  echo "Run npm install and optionally npm run build before running this script." >&2
  return 71
}
