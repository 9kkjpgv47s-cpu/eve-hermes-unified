#!/usr/bin/env bash
# H4: fail if production code constructs lane adapters outside the unified ingress.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

violations=0

while IFS= read -r -d '' f; do
  if [[ "$f" == "$ROOT_DIR/src/bin/unified-dispatch.ts" ]]; then
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
  if grep -qE '\bdispatchUnifiedMessage\b' "$f" 2>/dev/null; then
    echo "error: dispatchUnifiedMessage referenced outside unified entry/runtime in $f" >&2
    grep -nE '\bdispatchUnifiedMessage\b' "$f" >&2 || true
    violations=1
  fi
done < <(find "$ROOT_DIR/src" -type f -name '*.ts' -print0)

if [[ "$violations" -ne 0 ]]; then
  exit 2
fi

echo "ok: legacy dispatch entrypoint scan passed."
