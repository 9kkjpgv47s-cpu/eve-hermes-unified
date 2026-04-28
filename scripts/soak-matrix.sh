#!/usr/bin/env bash
set -euo pipefail

# Multi-stage soak: run soak-simulate.sh for each UNIFIED_SOAK_MATRIX_STAGES entry (comma-separated),
# e.g. shadow,canary,majority. Each stage writes metrics to evidence/soak-latest-metrics-<stage>.json
# and runs the SLO gate unless UNIFIED_SOAK_RUN_SLO_GATE=0.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${UNIFIED_EVIDENCE_DIR:-$ROOT_DIR/evidence}"
export UNIFIED_EVIDENCE_DIR="$OUT_DIR"
mkdir -p "$OUT_DIR"

iterations="${1:-20}"
stages_raw="${UNIFIED_SOAK_MATRIX_STAGES:-shadow,canary,majority}"
IFS=',' read -r -a stages <<<"$stages_raw"

for stage in "${stages[@]}"; do
  stage_trimmed="$(echo "$stage" | tr -d '[:space:]')"
  if [[ -z "$stage_trimmed" ]]; then
    continue
  fi
  export UNIFIED_SOAK_CUTOVER_STAGE="$stage_trimmed"
  export UNIFIED_SOAK_METRICS_OUT="$OUT_DIR/soak-latest-metrics-${stage_trimmed}.json"
  bash "$ROOT_DIR/scripts/soak-simulate.sh" "$iterations"
done
