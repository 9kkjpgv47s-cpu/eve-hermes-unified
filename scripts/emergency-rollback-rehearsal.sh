#!/usr/bin/env bash
# H3: emit operator-facing emergency rollback rehearsal manifest (no production mutation).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${UNIFIED_EVIDENCE_DIR:-$ROOT_DIR/evidence}"
mkdir -p "$OUT_DIR"
timestamp="$(date -u +%Y%m%d-%H%M%S)"
manifest="$OUT_DIR/emergency-rollback-rehearsal-${timestamp}.json"

rollback_script="$ROOT_DIR/scripts/prod-rollback-eve-safe-lane.sh"
cutover_script="$ROOT_DIR/scripts/prod-cutover-stage.sh"
evaluate_script="$ROOT_DIR/scripts/evaluate-auto-rollback-policy.mjs"

node -e '
const fs = require("fs");
const manifest = {
  generatedAtIso: new Date().toISOString(),
  kind: "emergency_rollback_rehearsal_manifest",
  rollbackScript: process.argv[1],
  rollbackScriptPresent: fs.existsSync(process.argv[1]),
  cutoverScript: process.argv[2],
  cutoverScriptPresent: fs.existsSync(process.argv[2]),
  evaluateAutoRollbackScript: process.argv[3],
  evaluateAutoRollbackScriptPresent: fs.existsSync(process.argv[3]),
  operatorCommands: [
    "npm run cutover:rollback",
    "npm run cutover:stage -- shadow",
    "npm run evaluate:auto-rollback-policy -- --stage shadow --evidence-dir evidence",
  ],
  note: "Rehearsal manifest only; does not modify gateway env or run production rollback.",
};
fs.writeFileSync(process.argv[4], JSON.stringify(manifest, null, 2) + "\n", "utf8");
' "$rollback_script" "$cutover_script" "$evaluate_script" "$manifest"

echo "Wrote $manifest"
