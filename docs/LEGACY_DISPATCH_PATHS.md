# Legacy dispatch path inventory (H4)

This document lists **known code paths** that execute unified dispatch or touch lane adapters, for **shadow deprecation** and merge gates (`NEXT_LONG_HORIZON_ACTION_PLAN.md` H4).

## Canonical production ingress

| Path | Role |
|------|------|
| `src/bin/unified-dispatch.ts` | **Only** supported TS entry that constructs `EveAdapter` / `HermesAdapter` and runs `dispatchUnifiedMessage`. |
| `dist/src/bin/unified-dispatch.js` | Compiled form of the above (CI, soak, shell scripts). |

## Operator / CI scripts that shell out to `unified-dispatch`

These invoke the **same** CLI binary; they do not construct adapters directly:

- `scripts/ci-dispatch-transcript.sh`
- `scripts/soak-simulate.sh`
- `scripts/failure-injection-smoke.sh`
- `scripts/regression-eve-primary.sh`
- `scripts/verify-cutover-readiness.sh`

## Tests

Unit tests use **`FakeLaneAdapter`** or **`LaneAdapter`** mocks. They must **not** import `EveAdapter` / `HermesAdapter` except via the real `unified-dispatch` binary in subprocess tests.

## Static gate

`npm run validate:legacy-dispatch-paths` runs `scripts/ci-check-legacy-dispatch-paths.sh`, which fails if `EveAdapter` or `HermesAdapter` appears under `src/` outside `eve-adapter.ts`, `hermes-adapter.ts`, and `unified-dispatch.ts`.

## Contract conformance

`npm run validate:dispatch-contract` validates every `test/fixtures/unified-dispatch-result-v*.json` file with `validateUnifiedDispatchResult` (see `docs/DISPATCH_CONTRACT_V1.md`). Bundled examples include primary-pass, Hermes fallback, fail-closed primary failure, and capability-pass shapes.

`scripts/regression-eve-primary.sh` optionally validates each per-case dispatch JSON via the same CLI when **`UNIFIED_REGRESSION_VALIDATE_DISPATCH_CONTRACT`** is not `0` (default: on).

`scripts/verify-cutover-readiness.sh` validates each dispatch probe and the rollback probe the same way when **`UNIFIED_CUTOVER_READINESS_VALIDATE_DISPATCH_CONTRACT`** is not `0` (default: on).
