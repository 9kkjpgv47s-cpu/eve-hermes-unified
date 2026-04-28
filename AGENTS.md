# AGENTS

Use this file as the first-run briefing for a fresh cloud agent.

## Mission

Converge Eve and Hermes into one operating runtime with one policy router, one canonical dispatch contract, and a staged production cutover path that is always rollback-safe.

## Non-Negotiables

1. Preserve Eve-safe behavior when routing is configured for Eve-primary fail-closed mode.
2. Keep all message handling traceable with a canonical `traceId`.
3. Route through a single policy decision point (`routeMessage`) before lane execution.
4. Maintain deterministic failure classification (`provider_limit`, `cooldown`, `dispatch_failure`, `state_unavailable`, `policy_failure`).
5. Keep rollback commands operational and documented.

## H3 runtime durability (optional, env-driven)

File-backed unified memory can use `UNIFIED_MEMORY_JOURNAL_PATH` (WAL). Dispatch audit logs support size rotation and numbered backup retention (`UNIFIED_AUDIT_LOG_ROTATION_*`). Capability policy **denials** can append to `UNIFIED_CAPABILITY_POLICY_AUDIT_PATH`. Capability handlers can use `UNIFIED_CAPABILITY_EXECUTION_TIMEOUT_MS`. Defaults keep prior behavior (paths empty or zero = disabled). See `.env.example` and `docs/CLOUD_AGENT_HANDOFF.md`.

## Mandatory Read Order (Before Editing)

1. `README.md`
2. `docs/PROJECT_VISION.md`
3. `docs/UNIFIED_ARCHITECTURE_SPEC.md`
4. `docs/SUBSYSTEM_CONVERGENCE_PLAN.md`
5. `docs/MASTER_EXECUTION_CHECKLIST.md`
6. `docs/NEXT_LONG_HORIZON_ACTION_PLAN.md`
7. `docs/VALIDATION_HARDENING_MATRIX.md`
8. `docs/PRODUCTION_CUTOVER_RUNBOOK.md`
9. `docs/CLOUD_AGENT_HANDOFF.md`

## Build and Validation Commands

Run from repository root:

```bash
npm install
npm run check
npm test
npm run build
npm run dispatch -- --text "agent baseline check" --chat-id 1 --message-id 1
```

Extended validation:

```bash
npm run validate:failure-injection
npm run validate:soak
npm run validate:evidence-summary
npm run validate:regression-eve-primary
npm run validate:cutover-readiness
npm run validate:release-readiness
npm run validate:initial-scope
npm run validate:merge-bundle
npm run check:stage-promotion-readiness -- --target-stage canary
npm run promote:stage -- --target-stage canary --dry-run
npm run run:stage-drill -- --target-stage canary --dry-run
npm run run:h2-drill-suite -- --dry-run --evidence-dir evidence
npm run calibrate:rollback-thresholds -- --stage majority --evidence-dir evidence
npm run run:supervised-rollback-simulation -- --stage majority --evidence-dir evidence --allow-horizon-mismatch --skip-cutover-readiness
npm run run:h2-closeout -- --evidence-dir evidence --horizon-status-file docs/HORIZON_STATUS.json --runtime-env-file "$HOME/.openclaw/run/gateway.env" --allow-horizon-mismatch --skip-cutover-readiness
npm run promote:horizon -- --horizon H2 --next-horizon H3 --horizon-status-file docs/HORIZON_STATUS.json --evidence-dir evidence --allow-horizon-mismatch --note "Promote H2 after closeout"
npm run run:h2-promotion -- --evidence-dir evidence --horizon-status-file docs/HORIZON_STATUS.json --runtime-env-file "$HOME/.openclaw/run/gateway.env" --allow-horizon-mismatch --skip-cutover-readiness
# enforce longer-horizon runway on promotion:
#   --require-progressive-goals --minimum-goal-increase 1
#   --goal-policy-key H2->H3
# optionally require multi-transition policy coverage before promotion:
#   --require-goal-policy-coverage --goal-policy-coverage-until-horizon H5 --require-policy-tagged-targets
# optionally require the readiness-audit gate before promotion:
#   --require-goal-policy-readiness-audit --goal-policy-readiness-audit-max-target-horizon H5 --require-goal-policy-readiness-tagged-targets
# strict one-flag policy hardening mode (progressive + coverage + readiness audit + tagged + positive pending mins):
#   --strict-goal-policy-gates --goal-policy-key H2->H3
# optional: require dedicated goal-policy file validation during promotion:
#   --require-goal-policy-file-validation --goal-policy-file-validation-out evidence/goal-policy-file-validation.json
# optional dedicated goal-policy source:
#   --goal-policy-file docs/GOAL_POLICIES.json
# or omit the flag and auto-discovery will load GOAL_POLICIES.json next to HORIZON_STATUS.json when present
# policy-file schema/coverage gate (explicit file mode):
#   npm run validate:goal-policy-file -- --goal-policy-file docs/GOAL_POLICIES.json
npm run validate:h2-closeout -- --evidence-dir evidence --horizon-status-file docs/HORIZON_STATUS.json
npm run audit:goal-policy-readiness -- --horizon-status-file docs/HORIZON_STATUS.json --source-horizon H2 --until-horizon H5 --require-tagged-requirements
# optional deterministic evidence mode override:
#   --evidence-selection-mode latest-passing
npm run evaluate:auto-rollback-policy -- --stage canary --evidence-dir evidence
npm run validate:horizon-closeout -- --horizon H1 --next-horizon H2
npm run bundle:merge-readiness
npm run validate:all
```

Cutover controls:

```bash
npm run cutover:stage -- shadow
npm run cutover:stage -- canary
npm run cutover:stage -- majority
npm run cutover:stage -- full
npm run cutover:rollback
```

Cutover stage rollout controls (set in gateway env file):
- `UNIFIED_ROUTER_CUTOVER_STAGE`: `shadow|canary|majority|full`
- `UNIFIED_ROUTER_CANARY_CHAT_IDS`: comma-separated chat IDs routed to Hermes in canary
- `UNIFIED_ROUTER_MAJORITY_PERCENT`: integer `0-100` stable percentage for Hermes routing in majority

## Working Rules for Cloud Agents

1. Treat `src/contracts/types.ts` as canonical schema source.
2. Changes to dispatch behavior must include tests in `test/`.
3. Do not remove rollback switches or fail-closed controls.
4. Keep routing reasons explicit and machine-readable.
5. Ensure CLI output remains valid JSON for evidence capture.

## Definition of Done by Phase

### Phase 1: Gateway + Runtime Policy Convergence
- Ingress path calls `dispatchUnifiedMessage`.
- Routing decisions are deterministic and tested.
- Fallback and fail-closed behavior are tested.

### Phase 2: Memory Convergence
- Introduce shared memory store interface and adapters.
- Keep backward compatibility for legacy state references.

### Phase 3: Skills/Tools Convergence
- Establish shared capability registry.
- Register lane-specific tool wrappers under one catalog.

### Phase 4: Control Plane Convergence
- Consolidate env schema with compatibility shims.
- Remove direct legacy runtime entry points after parity validation.

### Phase 5: Production Cutover Completion
- Validation matrix passes.
- Rollback drill succeeds.
- Full cutover is operable via documented runbook switches.
