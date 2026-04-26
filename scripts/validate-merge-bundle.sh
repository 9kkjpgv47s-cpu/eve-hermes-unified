#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${UNIFIED_EVIDENCE_DIR:-$ROOT_DIR/evidence}"
mkdir -p "$OUT_DIR"

if [[ "${UNIFIED_MERGE_BUNDLE_RUN_RELEASE_READINESS:-0}" == "1" ]]; then
  npm --prefix "$ROOT_DIR" run validate:release-readiness
fi

if [[ "${UNIFIED_MERGE_BUNDLE_RUN_INITIAL_SCOPE:-0}" == "1" ]]; then
  npm --prefix "$ROOT_DIR" run validate:initial-scope
fi

newest_matching_file() {
  local pattern="$1"
  shopt -s nullglob
  local matches=($pattern)
  shopt -u nullglob
  if [[ ${#matches[@]} -eq 0 ]]; then
    printf '%s' ""
    return 0
  fi
  printf '%s' "${matches[${#matches[@]}-1]}"
}

RELEASE_READINESS_PATH="${UNIFIED_RELEASE_READINESS_PATH:-}"
if [[ -z "$RELEASE_READINESS_PATH" ]]; then
  RELEASE_READINESS_PATH="$(newest_matching_file "$OUT_DIR"/release-readiness-*.json)"
fi

INITIAL_SCOPE_PATH="${UNIFIED_INITIAL_SCOPE_REPORT_PATH:-}"
if [[ -z "$INITIAL_SCOPE_PATH" ]]; then
  INITIAL_SCOPE_PATH="$(newest_matching_file "$OUT_DIR"/initial-scope-validation-*.json)"
fi

BUNDLE_DIR="${UNIFIED_MERGE_BUNDLE_DIR:-$OUT_DIR/merge-readiness-bundle-$(date +%Y%m%d-%H%M%S)}"
ARCHIVE_PATH="${UNIFIED_MERGE_BUNDLE_ARCHIVE_PATH:-$OUT_DIR/merge-readiness-bundle-$(date +%Y%m%d-%H%M%S).tar.gz}"
MANIFEST_PATH="${UNIFIED_MERGE_BUNDLE_MANIFEST_PATH:-$BUNDLE_DIR/merge-readiness-manifest.json}"

node "$ROOT_DIR/scripts/build-merge-readiness-bundle.mjs" \
  --evidence-dir "$OUT_DIR" \
  --release-readiness "$RELEASE_READINESS_PATH" \
  --initial-scope "$INITIAL_SCOPE_PATH" \
  --bundle-dir "$BUNDLE_DIR" \
  --archive-path "$ARCHIVE_PATH" \
  --manifest-out "$MANIFEST_PATH"

echo "Wrote $MANIFEST_PATH"
