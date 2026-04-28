# AGENT (High-Output Cloud Agent Handoff)

Use this file as the zero-context entrypoint when switching to a higher-output cloud agent.

## Objective

Drive the Eve/Hermes convergence work forward aggressively while preserving rollback safety, deterministic routing, and machine-verifiable evidence.

## Current Program State

- Horizon: `H2` (`docs/HORIZON_STATUS.json`); **H4 slice complete** in-repo (`h4-action-1`–`h4-action-4`): contract stamping, extended legacy scan (scripts/docs + allowlist), fixtures + scan tests, `validate:all` gate.
- Primary focus: H2 operationalization; next horizon runway is **H5** (see `docs/HORIZON_STATUS.json` `h5-action-*`).
- New orchestration path is implemented:
  - `npm run run:stage-drill -- --target-stage <canary|majority|full> ...`
- Current branch/PR may change; always confirm at startup:
  - `git branch --show-current`
  - `git log --oneline -n 1`
  - `gh pr view --json number,title,headRefName,baseRefName,state`

## Read Order (Do Not Skip)

1. `README.md`
2. `AGENTS.md`
3. `docs/CLOUD_AGENT_HANDOFF.md`
4. `docs/H4_UNIFIED_DISPATCH_CONTRACT.md`
5. `docs/NEXT_LONG_HORIZON_ACTION_PLAN.md`
6. `docs/PRODUCTION_CUTOVER_RUNBOOK.md`
7. `docs/HORIZON_STATUS.json`

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

### H4 unified dispatch ingress scan

```bash
npm run scan:legacy-dispatch-entrypoints
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
6. **H5 next:** tenant isolation, region-aware failover/replay, bounded remediation playbooks (`h5-action-1`..`h5-action-3` in `docs/HORIZON_STATUS.json`).

## Done Signal for Each Iteration

- New behavior implemented and covered by tests.
- Validation commands executed with clear pass/fail outcomes.
- Handoff docs updated.
- Changes committed + pushed.
- PR created/updated.
