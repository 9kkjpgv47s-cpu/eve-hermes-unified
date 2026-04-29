#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${UNIFIED_EVIDENCE_DIR:-$ROOT_DIR/evidence}"
mkdir -p "$OUT_DIR"

manifest="$OUT_DIR/emergency-rollback-rehearsal-$(date +%Y%m%d-%H%M%S).json"
env_file="${UNIFIED_RUNTIME_ENV_FILE:-$HOME/.openclaw/run/gateway.env}"

apply="${EMERGENCY_ROLLBACK_APPLY:-0}"
if [[ "$apply" == "1" ]]; then
  if [[ ! -f "$env_file" ]]; then
    echo "Missing env file for apply: $env_file" >&2
    exit 1
  fi
  bash "$ROOT_DIR/scripts/prod-rollback-eve-safe-lane.sh"
fi

export ER_MANIFEST="$manifest"
export ER_ROOT="$ROOT_DIR"
export ER_ISO="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
export ER_DRY_RUN="${EMERGENCY_ROLLBACK_DRY_RUN:-1}"
export ER_ENV_FILE="$env_file"
if [[ "$apply" == "1" ]]; then
  export ER_APPLY_STEP="executed"
else
  export ER_APPLY_STEP="skipped"
fi

node --input-type=module <<'NODE'
import { writeFileSync } from "node:fs";
const payload = {
  schemaVersion: "v1",
  generatedAtIso: process.env.ER_ISO,
  dryRun: process.env.ER_DRY_RUN === "1",
  targetEnvFile: process.env.ER_ENV_FILE,
  rollbackScript: `${process.env.ER_ROOT}/scripts/prod-rollback-eve-safe-lane.sh`,
  steps: [
    {
      id: "review-eve-safe-lane-template",
      note: "prod-rollback-eve-safe-lane.sh pins eve-primary, no-fallback, shadow",
    },
    { id: "optional-apply", status: process.env.ER_APPLY_STEP },
  ],
};
writeFileSync(process.env.ER_MANIFEST!, JSON.stringify(payload, null, 2) + "\n", "utf8");
console.log(process.env.ER_MANIFEST);
NODE

echo "Wrote $manifest"
