# Validation and Hardening Matrix

## Test Classes

| Class | Target | Evidence |
|---|---|---|
| Contract tests | Canonical envelope/routing/dispatch/response schema validity | `npm test` results |
| Integration tests | Lane routing behavior + fallback determinism | test output + captured JSON traces |
| Failure injection | 429, timeout, stale state, lane crash | scripted failure run logs |
| Soak | sustained mixed traffic routing and latency | aggregated run report |
| Regression | Eve existing behavior under Eve-primary mode | regression test report |

## Required SLO Gates

- Success rate >= 99% in staged lane.
- P95 end-to-end dispatch latency within agreed threshold.
- Zero unclassified failures.
- Zero missing `traceId` in emitted responses.

Default gate environment variables (used by `npm run validate:evidence-summary`):

- `UNIFIED_EVIDENCE_MIN_SUCCESS_RATE` (default `0.99`)
- `UNIFIED_EVIDENCE_MAX_P95_LATENCY_MS` (default `2000`)
- `UNIFIED_EVIDENCE_MAX_MISSING_TRACE_RATE` (default `0`)
- `UNIFIED_EVIDENCE_MAX_UNCLASSIFIED_FAILURES` (default `0`)

## Failure Injection Scenarios

1. Eve lane command timeout.
2. Hermes lane non-zero exit.
3. Synthetic provider-limit response mapping.
4. Dispatch-state read mismatch.
5. Policy fail-closed path with no fallback.
6. Hermes timeout injection via tiny timeout config.
7. Eve stale/missing dispatch-state file.
8. Hermes synthetic provider-limit mapping.

## Evidence Bundle Contents

- Unified dispatch JSON transcript.
- Lane-specific state snapshots.
- Summary metrics report (pass/fail by scenario).
- Build/test command outputs.
