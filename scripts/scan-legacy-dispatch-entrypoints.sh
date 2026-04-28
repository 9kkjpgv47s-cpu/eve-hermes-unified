#!/usr/bin/env bash
# H4: fail if production code constructs lane adapters outside the unified ingress, or
# invokes dispatchUnifiedMessage outside unified entry/runtime.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

violations=0

ALLOWLIST_DIRECT_UNIFIED_INVOCATION=(
  "$ROOT_DIR/scripts/scan-legacy-dispatch-entrypoints.sh"
  "$ROOT_DIR/scripts/soak-simulate.sh"
  "$ROOT_DIR/scripts/verify-cutover-readiness.sh"
  "$ROOT_DIR/scripts/regression-eve-primary.sh"
  "$ROOT_DIR/scripts/failure-injection-smoke.sh"
)

is_allowlisted_direct_invocation() {
  local f="$1"
  local a
  for a in "${ALLOWLIST_DIRECT_UNIFIED_INVOCATION[@]}"; do
    if [[ "$f" == "$a" ]]; then
      return 0
    fi
  done
  return 1
}

check_patterns_in_file() {
  local f="$1"
  shift
  local label="$1"
  shift
  local pattern
  for pattern in "$@"; do
    if grep -qE "$pattern" "$f" 2>/dev/null; then
      echo "error: $label in $f (pattern: $pattern)" >&2
      grep -nE "$pattern" "$f" >&2 || true
      violations=1
    fi
  done
}

while IFS= read -r -d '' f; do
  if [[ "$f" == "$ROOT_DIR/src/bin/unified-dispatch.ts" ]]; then
    continue
  fi
  if [[ "$f" == "$ROOT_DIR/src/runtime/build-unified-dispatch-runtime.ts" ]]; then
    continue
  fi
  if grep -qE '\bnew (EveAdapter|HermesAdapter)\b' "$f" 2>/dev/null; then
    echo "error: forbidden lane adapter construction in $f (use src/bin/unified-dispatch.ts only)." >&2
    grep -nE '\bnew (EveAdapter|HermesAdapter)\b' "$f" >&2 || true
    violations=1
  fi
done < <(find "$ROOT_DIR/src" -type f -name '*.ts' -print0)

while IFS= read -r -d '' f; do
  if [[ "$f" == "$ROOT_DIR/src/runtime/unified-dispatch.ts" || "$f" == "$ROOT_DIR/src/bin/unified-dispatch.ts" ]]; then
    continue
  fi
  if [[ "$f" == "$ROOT_DIR/src/bin/replay-dispatch-wal.ts" ]]; then
    continue
  fi
  if grep -qE '\bdispatchUnifiedMessage\b' "$f" 2>/dev/null; then
    echo "error: dispatchUnifiedMessage referenced outside unified entry/runtime in $f" >&2
    grep -nE '\bdispatchUnifiedMessage\b' "$f" >&2 || true
    violations=1
  fi
done < <(find "$ROOT_DIR/src" -type f -name '*.ts' -print0)

FORBIDDEN_SCRIPT_PATTERNS=(
  '\beve-task-dispatch(\.sh)?\b'
  '-m[[:space:]]+hermes[[:space:]]+gateway'
)

while IFS= read -r -d '' f; do
  if [[ "$f" == "$ROOT_DIR/scripts/scan-legacy-dispatch-entrypoints.sh" ]]; then
    continue
  fi
  check_patterns_in_file "$f" "forbidden legacy dispatch / Hermes gateway shell pattern" "${FORBIDDEN_SCRIPT_PATTERNS[@]}"
  if ! is_allowlisted_direct_invocation "$f"; then
    check_patterns_in_file "$f" "forbidden direct unified-dispatch invocation (use npm run dispatch or allowlisted harness)" \
      'node[[:space:]]+[^[:space:]]*unified-dispatch\.js' \
      'tsx[[:space:]]+[^[:space:]]*unified-dispatch\.ts'
  fi
done < <(find "$ROOT_DIR/scripts" -type f \( -name '*.sh' -o -name '*.mjs' \) -print0)

if [[ -d "$ROOT_DIR/docs" ]]; then
  while IFS= read -r -d '' f; do
    check_patterns_in_file "$f" "forbidden legacy dispatch / Hermes gateway shell pattern in docs" "${FORBIDDEN_SCRIPT_PATTERNS[@]}"
  done < <(find "$ROOT_DIR/docs" -type f -name '*.md' -print0)
fi

if [[ "$violations" -ne 0 ]]; then
  exit 2
fi

echo "ok: legacy dispatch entrypoint scan passed."
