#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${UNIFIED_EVIDENCE_DIR:-$ROOT_DIR/evidence}"
mkdir -p "$OUT_DIR"

SUMMARY_PATH="${UNIFIED_EVIDENCE_SUMMARY_PATH:-$OUT_DIR/validation-summary-$(date +%Y%m%d-%H%M%S).json}"
MIN_SUCCESS_RATE="${UNIFIED_EVIDENCE_MIN_SUCCESS_RATE:-0.99}"
MAX_MISSING_TRACE_RATE="${UNIFIED_EVIDENCE_MAX_MISSING_TRACE_RATE:-0}"
MAX_UNCLASSIFIED_FAILURES="${UNIFIED_EVIDENCE_MAX_UNCLASSIFIED_FAILURES:-0}"
MAX_P95_LATENCY_MS="${UNIFIED_EVIDENCE_MAX_P95_LATENCY_MS:-2500}"
MAX_DISPATCH_FAILURE_RATE="${UNIFIED_EVIDENCE_MAX_DISPATCH_FAILURE_RATE:-}"
MAX_POLICY_FAILURE_RATE="${UNIFIED_EVIDENCE_MAX_POLICY_FAILURE_RATE:-}"
REQUIRE_FAILURE_SCENARIOS="${UNIFIED_EVIDENCE_REQUIRE_FAILURE_SCENARIOS:-0}"

extra_args=()
if [[ -n "${MAX_DISPATCH_FAILURE_RATE}" ]]; then
  extra_args+=(--max-dispatch-failure-rate "$MAX_DISPATCH_FAILURE_RATE")
fi
if [[ -n "${MAX_POLICY_FAILURE_RATE}" ]]; then
  extra_args+=(--max-policy-failure-rate "$MAX_POLICY_FAILURE_RATE")
fi

node "$ROOT_DIR/scripts/summarize-evidence.mjs" \
  --evidence-dir "$OUT_DIR" \
  --out "$SUMMARY_PATH" \
  --min-success-rate "$MIN_SUCCESS_RATE" \
  --max-missing-trace-rate "$MAX_MISSING_TRACE_RATE" \
  --max-unclassified-failures "$MAX_UNCLASSIFIED_FAILURES" \
  --max-p95-latency-ms "$MAX_P95_LATENCY_MS" \
  "${extra_args[@]}" \
  $(if [[ "$REQUIRE_FAILURE_SCENARIOS" == "1" ]]; then echo "--require-failure-scenarios"; fi)

echo "Wrote $SUMMARY_PATH"
