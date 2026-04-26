#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${UNIFIED_EVIDENCE_DIR:-$ROOT_DIR/evidence}"
mkdir -p "$OUT_DIR"

SUMMARY_PATH="${UNIFIED_RELEASE_READINESS_SUMMARY_PATH:-${UNIFIED_RELEASE_READINESS_REPORT_PATH:-$OUT_DIR/release-readiness-$(date +%Y%m%d-%H%M%S).json}}"

if [[ -z "${UNIFIED_RELEASE_READINESS_VALIDATE_ALL_COMMAND:-}" ]]; then
  validate_all_command=(npm --prefix "$ROOT_DIR" run validate:all)
else
  validate_all_command=(bash -lc "$UNIFIED_RELEASE_READINESS_VALIDATE_ALL_COMMAND")
fi

if [[ "${UNIFIED_RELEASE_READINESS_RUN_VALIDATE_ALL:-1}" == "1" ]]; then
  "${validate_all_command[@]}"
else
  npm --prefix "$ROOT_DIR" run check
  if [[ "${UNIFIED_RELEASE_READINESS_SKIP_TEST:-0}" != "1" ]]; then
    npm --prefix "$ROOT_DIR" test
  fi
  npm --prefix "$ROOT_DIR" run build
  npm --prefix "$ROOT_DIR" run validate:failure-injection
  npm --prefix "$ROOT_DIR" run validate:soak
  npm --prefix "$ROOT_DIR" run validate:evidence-summary
  npm --prefix "$ROOT_DIR" run validate:regression-eve
  npm --prefix "$ROOT_DIR" run validate:cutover-readiness
fi

COMMAND_LOG_DIR="${UNIFIED_RELEASE_READINESS_COMMAND_LOG_DIR:-}"

node "$ROOT_DIR/scripts/release-readiness.mjs" \
  --evidence-dir "$OUT_DIR" \
  --out "$SUMMARY_PATH" \
  $(if [[ -n "$COMMAND_LOG_DIR" ]]; then printf '%s %s' "--command-log-dir" "$COMMAND_LOG_DIR"; fi)

echo "Wrote $SUMMARY_PATH"
