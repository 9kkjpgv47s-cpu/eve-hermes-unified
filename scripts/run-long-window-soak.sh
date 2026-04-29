#!/usr/bin/env bash
set -euo pipefail

# Long-window soak: more iterations than default validate:soak, then emit soak-slo-scheduled-*.json for archival.
# Iterations: first CLI arg, else UNIFIED_SOAK_LONG_ITERATIONS (default 200), capped at 2000.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${UNIFIED_EVIDENCE_DIR:-$ROOT_DIR/evidence}"
mkdir -p "$OUT_DIR"

raw_iters="${1:-${UNIFIED_SOAK_LONG_ITERATIONS:-200}}"
if ! [[ "$raw_iters" =~ ^[0-9]+$ ]]; then
  echo "Invalid iteration count: $raw_iters" >&2
  exit 2
fi
if (( raw_iters < 1 )); then
  echo "Iteration count must be >= 1" >&2
  exit 2
fi
if (( raw_iters > 2000 )); then
  echo "Capping iterations at 2000 (was $raw_iters)" >&2
  raw_iters=2000
fi

bash "$ROOT_DIR/scripts/soak-simulate.sh" "$raw_iters"

latest_soak="$(ls -t "$OUT_DIR"/soak-*.jsonl 2>/dev/null | head -1 || true)"
if [[ -z "$latest_soak" || ! -f "$latest_soak" ]]; then
  echo "No soak-*.jsonl found under $OUT_DIR" >&2
  exit 2
fi

stamp="$(date -u +%Y%m%dT%H%M%S)"
slo_out="$OUT_DIR/soak-slo-scheduled-${stamp}.json"

node "$ROOT_DIR/scripts/validate-soak-slo.mjs" \
  --file "$latest_soak" \
  --out "$slo_out"

echo "Long-window soak complete: dispatch log=$latest_soak slo=$slo_out"
