#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVIDENCE_DIR="${EVIDENCE_DIR:-$ROOT_DIR/evidence}"
mkdir -p "$EVIDENCE_DIR"

STAMP="$(date -u +"%Y%m%d-%H%M%S")"
OUT="$EVIDENCE_DIR/remediation-playbook-dry-run-${STAMP}.json"

cat >"$OUT" <<EOF
{
  "schemaVersion": "h5-remediation-dry-run-v1",
  "generatedAtIso": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "purpose": "Operator-facing bounded remediation rehearsal (no side effects)",
  "suggestedCommands": [
    "npm run validate:all",
    "npm run replay:dispatch-wal -- --dry-run",
    "npm run summarize:soak",
    "npm run validate:h5-tenant-isolation"
  ],
  "policyBounds": {
    "dryRunOnly": true,
    "requiresHumanApprovalForMutations": true
  }
}
EOF

echo "wrote $OUT"
