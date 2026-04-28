#!/usr/bin/env bash
# H4: fail if EveAdapter/HermesAdapter are referenced outside adapter modules and unified-dispatch entrypoint.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v rg >/dev/null 2>&1; then
  echo "rg (ripgrep) is required for validate:legacy-dispatch-paths" >&2
  exit 1
fi

matches="$(rg -n --glob '!**/eve-adapter.ts' --glob '!**/hermes-adapter.ts' --glob '!**/unified-dispatch.ts' \
  'EveAdapter|HermesAdapter' src || true)"

if [[ -n "${matches}" ]]; then
  echo "Legacy dispatch path check failed: lane adapters must only be constructed from src/bin/unified-dispatch.ts or adapter modules." >&2
  echo "${matches}" >&2
  exit 2
fi

echo "OK: no stray EveAdapter/HermesAdapter references under src/"
