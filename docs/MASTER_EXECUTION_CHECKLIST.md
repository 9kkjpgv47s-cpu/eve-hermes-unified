# Master Execution Checklist

This checklist is the canonical implementation gate for cloud-agent execution.

## Phase 0 - Bootstrap and Proven Baseline

- [ ] `npm install` completes without dependency errors.
- [ ] `.env` exists and is based on `.env.example`.
- [ ] `npm run check` passes.
- [ ] `npm test` passes.
- [ ] `npm run dispatch -- --text "baseline" --chat-id 1 --message-id 1` returns JSON output.

Exit criteria:
- Baseline evidence captured in logs and reproducible by another agent.

## Phase 1 - Gateway and Runtime Policy Convergence

- [ ] Ingress dispatch path routes through `dispatchUnifiedMessage`.
- [ ] Router emits deterministic `RoutingDecision` object.
- [ ] Explicit lane routing (`@cursor`, `@hermes`) covered by tests.
- [ ] Fail-closed + no-fallback behavior covered by tests.
- [ ] Fallback behavior covered by tests.
- [ ] Trace continuity (`traceId`) validated across envelope/dispatch/response.

Exit criteria:
- Unified routing behavior is deterministic and test-validated.

## Phase 2 - Memory Convergence Prep

- [ ] Define `UnifiedMemoryStore` interface (contracts and adapter expectations).
- [ ] Add adapter placeholders for Eve/Hermes memory implementations.
- [ ] Document migration constraints and compatibility expectations.

Exit criteria:
- Memory convergence work can proceed without contract ambiguity.

## Phase 3 - Skills and Tools Convergence Prep

- [ ] Define shared capability registry shape.
- [ ] Identify Eve command wrappers to map into shared registry.
- [ ] Identify Hermes tools to map into shared registry.
- [ ] Document conflict resolution strategy for naming and ownership.

Exit criteria:
- Skills/tool unification can proceed with a documented ownership model.

## Phase 4 - Control Plane Convergence

- [ ] Consolidate env variable documentation for unified runtime.
- [ ] Provide compatibility shims for legacy env names where required.
- [ ] Remove or isolate direct legacy routing entry points after parity confirmation.

Exit criteria:
- Unified control plane is canonical, with compatibility controls documented.

## Phase 5 - Validation and Hardening

- [ ] `npm run validate:failure-injection` runs and captures evidence.
- [ ] `npm run validate:soak` runs and captures evidence.
- [ ] Failure classes are classified (no unclassified failures in passing scenarios).
- [ ] Trace IDs are present in all sampled response outputs.

Exit criteria:
- Validation artifacts satisfy `docs/VALIDATION_HARDENING_MATRIX.md` gates.

## Phase 6 - Cutover Readiness and Rollback Confidence

- [ ] `npm run cutover:stage -- <shadow|canary|majority|full>` process verified.
- [ ] `npm run cutover:rollback` process verified.
- [ ] Rollback path returns runtime to Eve-primary/no-fallback safe lane.
- [ ] Operational checklist and emergency actions are confirmed from runbook.

Exit criteria:
- Cutover plan is executable with validated rollback safety.

## PR Delivery Requirements (every implementation cycle)

- [ ] Include scope summary and constraints.
- [ ] Include changed files and rationale.
- [ ] Include exact validation commands run.
- [ ] Include notable risks and follow-up tasks.
- [ ] Ensure staged changes are committed and pushed before and after testing deltas.
