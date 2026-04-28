#!/usr/bin/env bash
# H3: emit operator-facing emergency rollback rehearsal manifest (no production mutations).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVIDENCE_DIR="${1:-$ROOT_DIR/evidence}"
mkdir -p "$EVIDENCE_DIR"

STAMP="$(date -u +"%Y%m%d-%H%M%S")"
OUT="$EVIDENCE_DIR/emergency-rollback-rehearsal-${STAMP}.json"

export REHEARSAL_ROLLBACK_SCRIPT="$ROOT_DIR/scripts/prod-rollback-eve-safe-lane.sh"
export REHEARSAL_STAGE_SCRIPT="$ROOT_DIR/scripts/prod-cutover-stage.sh"

ROLLBACK_PRESENT="false"
STAGE_PRESENT="false"
[[ -f "$REHEARSAL_ROLLBACK_SCRIPT" ]] && ROLLBACK_PRESENT="true"
[[ -f "$REHEARSAL_STAGE_SCRIPT" ]] && STAGE_PRESENT="true"
export REHEARSAL_ROLLBACK_PRESENT="$ROLLBACK_PRESENT"
export REHEARSAL_STAGE_PRESENT="$STAGE_PRESENT"

node <<'NODE' >"$OUT"
const rollback = process.env.REHEARSAL_ROLLBACK_SCRIPT ?? "";
const stage = process.env.REHEARSAL_STAGE_SCRIPT ?? "";
const manifest = {
  manifestVersion: "h3-emergency-rollback-rehearsal-v1",
  generatedAtIso: new Date().toISOString(),
  dryRun: true,
  rollbackScript: rollback,
  cutoverStageScript: stage,
  rollbackScriptPresent: process.env.REHEARSAL_ROLLBACK_PRESENT === "true",
  cutoverStageScriptPresent: process.env.REHEARSAL_STAGE_PRESENT === "true",
  suggestedOperatorCommands: ["npm run cutover:rollback", "npm run cutover:stage -- shadow"],
};
process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
NODE

echo "wrote $OUT"
