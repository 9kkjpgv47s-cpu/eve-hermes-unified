#!/usr/bin/env bash
# H14 gate: shell scripts resolve unified-dispatch via unified-dispatch-runner.sh (no hard-coded dist-only paths).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/unified-dispatch-runner.sh
source "$ROOT_DIR/scripts/unified-dispatch-runner.sh"

resolve_unified_dispatch
echo "validate-shell-unified-dispatch: ok (${UNIFIED_DISPATCH_CMD[*]})"
