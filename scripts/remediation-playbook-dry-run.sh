#!/usr/bin/env bash
# H5: emit an auditable remediation dry-run manifest (no production side effects).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

EVIDENCE_DIR="${1:-$ROOT_DIR/evidence}"
mkdir -p "$EVIDENCE_DIR"

STAMP="$(date -u +"%Y%m%d-%H%M%S")"
OUT="$EVIDENCE_DIR/remediation-playbook-dry-run-${STAMP}.json"

node -e '
const crypto = require("node:crypto");
const stamp = new Date().toISOString();
const manifest = {
  manifestVersion: "h5-remediation-dry-run-v1",
  generatedAtIso: stamp,
  dryRun: true,
  boundedPolicy: {
    maxSimulatedSteps: 3,
    allowLiveMutation: false,
    allowExternalCalls: false,
  },
  simulatedSteps: [
    { id: "collect-dispatch-context", kind: "read", target: "unified-dispatch-result", status: "skipped" },
    { id: "validate-tenant-scope", kind: "validate", target: "tenant-isolation-invariants", status: "skipped" },
    { id: "operator-handoff", kind: "notify", target: "human-escalation-template", status: "skipped" },
  ],
  evidenceCommandsSuggested: [
    "npm run validate:h5-tenant-isolation",
    "npm run check && npm test",
  ],
  runId: "remediation-dry-run-" + crypto.randomUUID().slice(0, 8),
};
process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
' >"$OUT"

echo "wrote $OUT"
