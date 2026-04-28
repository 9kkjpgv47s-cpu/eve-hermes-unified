# AGENT (High-Output Cloud Agent Handoff)

Use this file as the zero-context entrypoint when switching to a higher-output cloud agent.

## Objective

Drive the Eve/Hermes convergence work forward aggressively while preserving rollback safety, deterministic routing, and machine-verifiable evidence.

## Current Program State

- Horizon: `H2` (`docs/HORIZON_STATUS.json`)
- Primary focus: staged promotion drills + rollback-policy enforcement with auditable artifacts
- New orchestration path is implemented:
  - `npm run run:stage-drill -- --target-stage <canary|majority|full> ...`
- Current branch/PR may change; always confirm at startup:
  - `git branch --show-current`
  - `git log --oneline -n 1`
  - `gh pr view --json number,title,headRefName,baseRefName,state`
- Vitest creates `./evidence` at test start (`test/global-setup.ts`) because it is gitignored but required by several script integration tests.
- **H3 file memory:** optional **`UNIFIED_MEMORY_JOURNAL_PATH`** WAL; optional **`UNIFIED_MEMORY_VERIFY_PERSIST`** / **`UNIFIED_MEMORY_VERIFY_JOURNAL_REPLAY`** — see `docs/CLOUD_AGENT_HANDOFF.md`.
- **Dispatch audit:** JSONL lines include **`auditSchemaVersion`** (**v2** includes **`tenantId`** `null` or string); validate with `validate-manifest-schema.mjs --type unified-dispatch-audit-jsonl` (v1 and v2 accepted). When **`UNIFIED_ROUTER_NO_FALLBACK_ON_PRIMARY_FAILURE_CLASSES`** skips fallback, **`fallbackInfo`** includes **`primaryFailureClass`** and **`noFallbackOnPrimaryFailureClasses`** for operator telemetry.
- **Capability policy audit:** append-only **`UNIFIED_CAPABILITY_POLICY_AUDIT_LOG_PATH`** JSONL; **`validate-manifest-schema.mjs --type capability-policy-audit-jsonl`**; optional **`UNIFIED_CAPABILITY_POLICY_AUDIT_ROTATION_*`** — see `docs/CLOUD_AGENT_HANDOFF.md`.
- **Closeout validator:** `validate-horizon-closeout.mjs` dual-reports **`horizon_drill_*` / `h2_drill_*`** and appends **`h2_closeout_run_*` / `h2_promotion_run_*`** aliases for horizon closeout/promotion run failure ids.
- **Horizon promotion:** `promote-horizon.mjs` emits **`closeout_run_horizon_closeout_gate_*`** and appends legacy **`closeout_run_h2_closeout_gate_*`** when the promotion source horizon is H2 or later (so H3→H4 promotions keep H2-keyed monitors working).
- **H2 closeout runner:** `run-h2-closeout.mjs` appends **`h2_closeout_gate_failed`** alongside **`horizon_closeout_gate_failed`** when the closeout `--horizon` is H2 or later.
- **Router fallback hardening:** **`UNIFIED_ROUTER_NO_FALLBACK_ON_PRIMARY_FAILURE_CLASSES`** — skip Hermes fallback on selected primary **`failureClass`** values — see `docs/CLOUD_AGENT_HANDOFF.md`.

## Read Order (Do Not Skip)

1. `README.md`
2. `AGENTS.md`
3. `docs/CLOUD_AGENT_HANDOFF.md`
4. `docs/NEXT_LONG_HORIZON_ACTION_PLAN.md`
5. `docs/PRODUCTION_CUTOVER_RUNBOOK.md`
6. `docs/HORIZON_STATUS.json`

## High-Output Execution Loop

1. Pick one meaningful H2 increment (not tiny cleanup-only work).
2. Implement code + tests together.
3. Run focused validations first, then full gate set as needed.
4. Emit/verify evidence artifacts under `evidence/`.
5. Update docs/handoff surfaces for any behavior or command changes.
6. Commit, push, and update PR in the same iteration.

## Command Pack

### Baseline

```bash
npm run check
npm test
```

### H2 Promotion/Policy Flow

```bash
npm run check:stage-promotion-readiness -- --target-stage canary --evidence-dir evidence
npm run promote:stage -- --target-stage canary --dry-run --evidence-dir evidence
npm run evaluate:auto-rollback-policy -- --stage canary --evidence-dir evidence
npm run run:stage-drill -- --target-stage canary --dry-run --evidence-dir evidence --horizon-status-file docs/HORIZON_STATUS.json
```

### Readiness / Evidence Gates

```bash
npm run validate:horizon-status
npm run validate:release-readiness
npm run validate:merge-bundle
npm run verify:merge-bundle -- --evidence-dir evidence --latest
```

## Guardrails

- Never remove rollback controls.
- Keep fail-closed behavior operable.
- Keep outputs JSON and machine-readable.
- Preserve canonical failure classes and trace continuity.
- Any routing/policy change must include tests and evidence.

## Immediate Next Technical Targets (H2+)

1. Majority-stage drill hardening (pass + fail scenarios, stable thresholds).
2. Auto-rollback simulation with optional `--auto-apply-rollback` under controlled test conditions.
3. Evidence freshness rules so stage drill reliably selects latest passing artifacts for all dependent gates.
4. Runbook tightening for operator replay of canary/majority incidents.
5. Extend closeout/promotion orchestration to horizon-generic operation (H3/H4) while preserving H2 command compatibility.

## Done Signal for Each Iteration

- New behavior implemented and covered by tests.
- Validation commands executed with clear pass/fail outcomes.
- Handoff docs updated.
- Changes committed + pushed.
- PR created/updated.
