# Master Execution Checklist

This checklist is the canonical implementation gate for cloud-agent execution.

## Phase 0 - Bootstrap and Proven Baseline

- [x] `npm install` completes without dependency errors.
- [x] `.env` exists and is based on `.env.example`.
- [x] `npm run check` passes.
- [x] `npm test` passes.
- [x] `npm run dispatch -- --text "baseline" --chat-id 1 --message-id 1` returns JSON output.

Exit criteria:
- Baseline evidence captured in logs and reproducible by another agent.

## Phase 1 - Gateway and Runtime Policy Convergence

- [x] Ingress dispatch path routes through `dispatchUnifiedMessage`.
- [x] Router emits deterministic `RoutingDecision` object.
- [x] Explicit lane routing (`@cursor`, `@hermes`) covered by tests.
- [x] Fail-closed + no-fallback behavior covered by tests.
- [x] Fallback behavior covered by tests.
- [x] Trace continuity (`traceId`) validated across envelope/dispatch/response.

Exit criteria:
- Unified routing behavior is deterministic and test-validated.

## Phase 2 - Memory Convergence Prep

- [x] Define `UnifiedMemoryStore` interface (contracts and adapter expectations).
- [x] Add adapter placeholders for Eve/Hermes memory implementations.
- [x] Document migration constraints and compatibility expectations.

Exit criteria:
- Memory convergence work can proceed without contract ambiguity.

## Phase 3 - Skills and Tools Convergence Prep

- [x] Define shared capability registry shape.
- [x] Identify Eve command wrappers to map into shared registry.
- [x] Identify Hermes tools to map into shared registry.
- [x] Document conflict resolution strategy for naming and ownership.

Exit criteria:
- Skills/tool unification can proceed with a documented ownership model.

## Phase 4 - Control Plane Convergence

- [x] Consolidate env variable documentation for unified runtime.
- [x] Provide compatibility shims for legacy env names where required.
- [x] Remove or isolate direct legacy routing entry points after parity confirmation.

Exit criteria:
- Unified control plane is canonical, with compatibility controls documented.

## Phase 5 - Validation and Hardening

- [x] `npm run validate:failure-injection` runs and captures evidence.
- [x] `npm run validate:soak` runs and captures evidence.
- [x] `npm run validate:regression-eve-primary` runs and captures Eve-safe regression evidence.
- [x] Failure classes are classified (no unclassified failures in passing scenarios).
- [x] Trace IDs are present in all sampled response outputs.

Exit criteria:
- Validation artifacts satisfy `docs/VALIDATION_HARDENING_MATRIX.md` gates.

## Phase 6 - Cutover Readiness and Rollback Confidence

- [x] `npm run cutover:stage -- <shadow|canary|majority|full>` process verified.
- [x] `npm run cutover:rollback` process verified.
- [x] `npm run validate:cutover-readiness` verifies stage transitions + rollback end state.
- [x] Rollback path returns runtime to Eve-primary/no-fallback safe lane.
- [x] Operational checklist and emergency actions are confirmed from runbook.
- [x] `npm run validate:release-readiness` emits a passing machine-readable readiness manifest.

Exit criteria:
- Cutover plan is executable with validated rollback safety.

## Phase 7 - Initial Scope Merge Gate

- [x] All checklist items in Phases 0-6 are checked in this file.
- [x] Latest release-readiness manifest reports `pass=true`.
- [x] `npm run validate:initial-scope` passes.

Exit criteria:
- Initial project scope is merge-ready with executable confirmation.

## Phase 8 - Post-H22 sustainment (continuous)

After horizon **H22** is completed in `docs/HORIZON_STATUS.json`, operators and agents should periodically confirm the sustainment bundle still passes end-to-end:

- [x] `npm run validate:horizon-status` exits `0`.
- [x] `npm run run:h17-assurance-bundle` exits `0` and emits `evidence/h17-assurance-bundle-*.json`.
- [x] `npm run run:h18-assurance-bundle` exits `0` and emits `evidence/h18-assurance-bundle-*.json`.
- [x] `npm run run:ci-soak-slo-gate` exits `0` and emits `evidence/ci-soak-slo-gate-*.json`.
- [x] `npm run run:unified-entrypoints-evidence` exits `0` and emits `evidence/unified-entrypoints-evidence-*.json`.
- [x] `npm run run:shell-unified-dispatch-ci-evidence` exits `0` and emits `evidence/shell-unified-dispatch-ci-evidence-*.json`.
- [x] `npm run validate:h22-closeout` exits `0` (uses evidence under `evidence/`).

Single command (chains post-H21 sustainment + H22 closeout and writes `evidence/post-h22-sustainment-loop-*.json` with structured `checks.*Pass` booleans):

- [x] `npm run verify:sustainment-loop` exits `0`.

Optional re-validation of the latest loop artifact without re-running:

- [x] `npm run validate:post-h22-sustainment-manifest` exits `0`.

Historical sustainment: **`npm run verify:sustainment-loop:h21-legacy`** / **`validate:post-h21-sustainment-manifest`** (H21 chain without H22 pin); **`npm run verify:sustainment-loop:h20-legacy`** / **`validate:post-h20-sustainment-manifest`**; **`verify:sustainment-loop:h19-legacy`** … **`h6-legacy`**.

Exit criteria:

- Sustainment verification is reproducible from a clean checkout after `npm install` and `mkdir -p evidence`.

## PR Delivery Requirements (every implementation cycle)

- [x] Include scope summary and constraints.
- [x] Include changed files and rationale.
- [x] Include exact validation commands run.
- [x] Include notable risks and follow-up tasks.
- [x] Ensure staged changes are committed and pushed before and after testing deltas.
