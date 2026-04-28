#!/usr/bin/env bash
# Emergency rollback rehearsal: emits a machine-readable manifest under evidence/.
# With --execute, applies Eve-safe rollback policy to the gateway env file (same semantics as cutover:rollback).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVIDENCE_DIR="${UNIFIED_EVIDENCE_DIR:-$ROOT_DIR/evidence}"
mkdir -p "$EVIDENCE_DIR"

EXECUTE=0
ENV_FILE="${UNIFIED_RUNTIME_ENV_FILE:-$HOME/.openclaw/run/gateway.env}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --execute)
      EXECUTE=1
      shift
      ;;
    --env-file)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

MANIFEST="$EVIDENCE_DIR/emergency-rollback-rehearsal-$(date +%Y%m%d-%H%M%S).json"
ROLLBACK_SCRIPT="$ROOT_DIR/scripts/prod-rollback-eve-safe-lane.sh"

python3 - <<'PY' "$MANIFEST" "$ENV_FILE" "$EXECUTE" "$ROLLBACK_SCRIPT"
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

manifest_path, env_file, execute_flag, rollback_script = sys.argv[1:5]
execute = execute_flag == "1"
payload = {
    "schemaVersion": "v1",
    "generatedAtIso": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "dryRun": not execute,
    "envFileTarget": env_file,
    "steps": [
        {"id": "verify_runtime_env_path", "status": "planned"},
        {"id": "apply_eve_safe_rollback_policy", "status": "planned"},
    ],
}
if not os.path.isfile(env_file):
    payload["steps"][0]["status"] = "failed"
    payload["steps"][0]["detail"] = "missing_env_file"
    payload["pass"] = False
else:
    payload["steps"][0]["status"] = "passed"
    if execute:
        try:
            subprocess.run(
                ["bash", rollback_script],
                check=True,
                env={**os.environ, "UNIFIED_RUNTIME_ENV_FILE": env_file},
            )
            payload["steps"][1]["status"] = "passed"
            payload["pass"] = True
        except subprocess.CalledProcessError as exc:
            payload["steps"][1]["status"] = "failed"
            payload["steps"][1]["detail"] = str(exc)
            payload["pass"] = False
    else:
        payload["steps"][1]["status"] = "skipped"
        payload["steps"][1]["detail"] = "dry_run_only"
        payload["pass"] = True

out = Path(manifest_path)
out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"manifest": str(out.resolve()), "pass": payload.get("pass"), "dryRun": payload["dryRun"]}))
PY
