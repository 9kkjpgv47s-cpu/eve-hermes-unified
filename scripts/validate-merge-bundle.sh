#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${UNIFIED_EVIDENCE_DIR:-$ROOT_DIR/evidence}"
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"

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
  RELEASE_READINESS_PATH="$(newest_matching_file "$OUT_DIR/release-readiness-*.json")"
fi

INITIAL_SCOPE_PATH="${UNIFIED_INITIAL_SCOPE_REPORT_PATH:-}"
if [[ -z "$INITIAL_SCOPE_PATH" ]]; then
  INITIAL_SCOPE_PATH="$(newest_matching_file "$OUT_DIR/initial-scope-validation-*.json")"
fi

BUNDLE_DIR="${UNIFIED_MERGE_BUNDLE_DIR:-$OUT_DIR/merge-readiness-bundle-$STAMP}"
ARCHIVE_PATH="${UNIFIED_MERGE_BUNDLE_ARCHIVE_PATH:-$OUT_DIR/merge-readiness-bundle-$STAMP.tar.gz}"
BUNDLE_MANIFEST_PATH="${UNIFIED_MERGE_BUNDLE_MANIFEST_PATH:-$BUNDLE_DIR/merge-readiness-manifest.json}"
VALIDATION_MANIFEST_PATH="${UNIFIED_MERGE_BUNDLE_VALIDATION_MANIFEST_PATH:-$OUT_DIR/merge-bundle-validation-$STAMP.json}"

set +e
node "$ROOT_DIR/scripts/build-merge-readiness-bundle.mjs" \
  --evidence-dir "$OUT_DIR" \
  --release-readiness "$RELEASE_READINESS_PATH" \
  --initial-scope "$INITIAL_SCOPE_PATH" \
  --bundle-dir "$BUNDLE_DIR" \
  --archive-path "$ARCHIVE_PATH" \
  --manifest-out "$BUNDLE_MANIFEST_PATH"
build_exit_code=$?
set -e

node - "$VALIDATION_MANIFEST_PATH" "$BUNDLE_MANIFEST_PATH" "$build_exit_code" "$RELEASE_READINESS_PATH" "$INITIAL_SCOPE_PATH" "$ARCHIVE_PATH" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const validationManifestPath = process.argv[2];
const bundleManifestPath = process.argv[3];
const buildExitCode = Number(process.argv[4] || "0");
const releaseReadinessPath = process.argv[5];
const initialScopePath = process.argv[6];
const archivePath = process.argv[7];

let bundleManifest = null;
if (bundleManifestPath && fs.existsSync(bundleManifestPath)) {
  bundleManifest = JSON.parse(fs.readFileSync(bundleManifestPath, "utf8"));
}

const failures = [];
if (buildExitCode !== 0) {
  failures.push("bundle_build_failed");
}
if (!releaseReadinessPath) {
  failures.push("missing_release_readiness_report");
}
if (!initialScopePath) {
  failures.push("missing_initial_scope_report");
}
if (!bundleManifest) {
  failures.push("missing_bundle_manifest");
}
if (bundleManifest && bundleManifest.pass !== true) {
  failures.push("bundle_manifest_failed");
}

const payload = {
  generatedAtIso: new Date().toISOString(),
  pass: failures.length === 0,
  files: {
    validationManifestPath,
    bundleManifestPath: bundleManifestPath || null,
    releaseReadinessPath: releaseReadinessPath || null,
    initialScopePath: initialScopePath || null,
    bundleArchivePath: archivePath || null,
  },
  checks: {
    buildExitCode,
    bundleManifestPresent: Boolean(bundleManifest),
    bundleManifestPass: Boolean(bundleManifest?.pass),
    bundleFailures: Array.isArray(bundleManifest?.failures) ? bundleManifest.failures : [],
  },
  failures,
};

fs.mkdirSync(path.dirname(validationManifestPath), { recursive: true });
fs.writeFileSync(validationManifestPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
NODE

echo "Wrote $VALIDATION_MANIFEST_PATH"
exit "$build_exit_code"
