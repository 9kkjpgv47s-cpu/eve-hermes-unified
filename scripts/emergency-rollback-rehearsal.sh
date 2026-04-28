#!/usr/bin/env bash
# H3: operator rehearsal bundle — records rollback path intent + optional auto-rollback policy eval.
# Does NOT invoke prod-rollback (that script mutates the gateway env file).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${UNIFIED_EVIDENCE_DIR:-$ROOT_DIR/evidence}"
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_JSON="$OUT_DIR/emergency-rollback-rehearsal-${STAMP}.json"

STAGE="${UNIFIED_REHEARSAL_STAGE:-canary}"
EVIDENCE_DIR="${UNIFIED_REHEARSAL_EVIDENCE_DIR:-$OUT_DIR}"
ROLLBACK_SCRIPT="$ROOT_DIR/scripts/prod-rollback-eve-safe-lane.sh"

ROLLBACK_SCRIPT_PRESENT="false"
if [[ -f "$ROLLBACK_SCRIPT" ]]; then
  ROLLBACK_SCRIPT_PRESENT="true"
fi

POLICY_OUT=""
POLICY_TMP="$OUT_DIR/.rehearsal-policy-${STAMP}.json"
if node "$ROOT_DIR/scripts/evaluate-auto-rollback-policy.mjs" --stage "$STAGE" --evidence-dir "$EVIDENCE_DIR" >"$POLICY_TMP" 2>/dev/null; then
  POLICY_OUT="$POLICY_TMP"
else
  rm -f "$POLICY_TMP" 2>/dev/null || true
fi

node - "$OUT_JSON" "$ROLLBACK_SCRIPT" "$ROLLBACK_SCRIPT_PRESENT" "$POLICY_OUT" "$STAGE" "$EVIDENCE_DIR" <<'NODE'
const fs = require("fs");
const [,, outPath, rollbackScript, present, policyPath, stage, evidenceDir] = process.argv;
const payload = {
  schemaVersion: "v1",
  generatedAtIso: new Date().toISOString(),
  pass: true,
  stage,
  evidenceDir,
  rollbackScript,
  rollbackScriptPresent: present === "true",
  rollbackPolicyArtifact: policyPath && policyPath.length > 0 ? policyPath : null,
  notes: [
    "Rehearsal manifest for operator readiness; does not apply prod rollback.",
    "Run scripts/prod-rollback-eve-safe-lane.sh only in a supervised maintenance window.",
    "Set UNIFIED_REHEARSAL_STAGE and UNIFIED_REHEARSAL_EVIDENCE_DIR to tune policy evaluation.",
  ],
};
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
NODE

rm -f "$POLICY_TMP" 2>/dev/null || true
