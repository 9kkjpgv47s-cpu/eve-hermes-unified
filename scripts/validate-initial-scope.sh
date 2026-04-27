#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${UNIFIED_EVIDENCE_DIR:-$ROOT_DIR/evidence}"
mkdir -p "$OUT_DIR"

OUTPUT_PATH="${UNIFIED_INITIAL_SCOPE_REPORT_PATH:-$OUT_DIR/initial-scope-validation-$(date +%Y%m%d-%H%M%S).json}"
CHECKLIST_PATH="${UNIFIED_MASTER_CHECKLIST_PATH:-$ROOT_DIR/docs/MASTER_EXECUTION_CHECKLIST.md}"
EVIDENCE_PATH="${UNIFIED_RELEASE_READINESS_PATH:-}"
require_goal_policy_validation_report="${UNIFIED_INITIAL_SCOPE_REQUIRE_GOAL_POLICY_FILE_VALIDATION_REPORT:-1}"

if [[ -z "$EVIDENCE_PATH" ]]; then
  EVIDENCE_PATH="$(ls -1 "$OUT_DIR"/release-readiness-*.json 2>/dev/null | sort | tail -n 1 || true)"
fi

if [[ -z "$EVIDENCE_PATH" ]]; then
  echo "No release readiness report found under $OUT_DIR. Run validate:release-readiness first." >&2
  exit 74
fi

node "$ROOT_DIR/scripts/validate-initial-scope.mjs" \
  --checklist "$CHECKLIST_PATH" \
  --release-readiness "$EVIDENCE_PATH" \
  $(if [[ "$require_goal_policy_validation_report" == "1" ]]; then printf '%s' "--require-goal-policy-file-validation-report"; fi) \
  --out "$OUTPUT_PATH"

echo "Wrote $OUTPUT_PATH"
