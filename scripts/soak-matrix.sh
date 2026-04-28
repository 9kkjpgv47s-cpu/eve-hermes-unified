#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${UNIFIED_EVIDENCE_DIR:-$ROOT_DIR/evidence}"
mkdir -p "$OUT_DIR"

iterations="${1:-15}"
stages="${UNIFIED_SOAK_MATRIX_STAGES:-shadow,canary}"

IFS=',' read -r -a stage_list <<<"$stages"
for stage in "${stage_list[@]}"; do
  stage_trimmed="$(echo "$stage" | tr -d '[:space:]')"
  [[ -z "$stage_trimmed" ]] && continue
  export UNIFIED_SOAK_CUTOVER_STAGE="$stage_trimmed"
  export UNIFIED_SOAK_METRICS_OUT="$OUT_DIR/soak-matrix-${stage_trimmed}-metrics.json"
  echo "==== soak matrix stage: $stage_trimmed ===="
  bash "$ROOT_DIR/scripts/soak-simulate.sh" "$iterations"
done

echo "Soak matrix complete"
