#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -d "$ROOT_DIR/sources/eve/.git" || ! -d "$ROOT_DIR/sources/hermes/.git" ]]; then
  echo "Sources not initialized. Run ./scripts/bootstrap-sources.sh first." >&2
  exit 1
fi

"$ROOT_DIR/scripts/bootstrap-sources.sh"
