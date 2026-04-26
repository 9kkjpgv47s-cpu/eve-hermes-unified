#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${UNIFIED_EVIDENCE_DIR:-$ROOT_DIR/evidence}"
mkdir -p "$OUT_DIR"

SUMMARY_PATH="${UNIFIED_EVIDENCE_SUMMARY_PATH:-$OUT_DIR/validation-summary-$(date +%Y%m%d-%H%M%S).json}"
MIN_SUCCESS_RATE="${UNIFIED_EVIDENCE_MIN_SUCCESS_RATE:-0.99}"
MAX_MISSING_TRACE_RATE="${UNIFIED_EVIDENCE_MAX_MISSING_TRACE_RATE:-0}"
MAX_UNCLASSIFIED_FAILURES="${UNIFIED_EVIDENCE_MAX_UNCLASSIFIED_FAILURES:-0}"

node "$ROOT_DIR/scripts/summarize-evidence.mjs" \
  --evidence-dir "$OUT_DIR" \
  --out "$SUMMARY_PATH" \
  --min-success-rate "$MIN_SUCCESS_RATE" \
  --max-missing-trace-rate "$MAX_MISSING_TRACE_RATE" \
  --max-unclassified-failures "$MAX_UNCLASSIFIED_FAILURES"

echo "Wrote $SUMMARY_PATH"
