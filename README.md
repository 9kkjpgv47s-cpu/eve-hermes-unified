# Eve-Hermes Unified

Cloud-agent-first integration repository that converges Eve and Hermes into one operating system over phased dual-lane routing.

## Start Here (Cloud Agents)

Use this ordered reading path before touching code:

1. `AGENTS.md`
2. `docs/PROJECT_VISION.md`
3. `docs/MASTER_EXECUTION_CHECKLIST.md`
4. `docs/CLOUD_AGENT_HANDOFF.md`
5. `docs/NEXT_LONG_HORIZON_ACTION_PLAN.md`
6. `docs/UNIFIED_ARCHITECTURE_SPEC.md`
7. `docs/SUBSYSTEM_CONVERGENCE_PLAN.md`
8. `docs/VALIDATION_HARDENING_MATRIX.md`
9. `docs/PRODUCTION_CUTOVER_RUNBOOK.md`

Long-horizon status lives in `docs/HORIZON_STATUS.json` (currently **H1–H26 completed** with **post-H26 sustainment** commands). After `npm install`, periodic operators/agents should:

```bash
mkdir -p evidence
npm run verify:sustainment-loop
npm run validate:post-h22-sustainment-manifest
```

Validation command set:

```bash
npm run check
npm test
npm run build
npm run validate:failure-injection
npm run validate:soak
npm run validate:evidence-summary
npm run validate:regression-eve-primary
npm run validate:cutover-readiness
npm run validate:release-readiness
npm run validate:initial-scope
npm run validate:merge-bundle
npm run bundle:merge-readiness
npm run verify:merge-bundle
npm run validate:manifest-schemas -- --latest-only
npm run validate:horizon-status
npm run validate:horizon-closeout -- --horizon H1 --next-horizon H2
npm run validate:h2-closeout -- --evidence-dir evidence --horizon-status-file docs/HORIZON_STATUS.json
npm run validate:goal-policy-file -- --horizon-status-file docs/HORIZON_STATUS.json --goal-policy-file docs/GOAL_POLICIES.json --source-horizon H2 --until-horizon H6 --require-tagged-requirements --require-positive-pending-min
# enable required goal-policy evidence inside release-readiness gate:
#   UNIFIED_RELEASE_READINESS_REQUIRE_GOAL_POLICY_FILE_VALIDATION=1 npm run validate:release-readiness
# optional explicit report pinning:
#   UNIFIED_RELEASE_READINESS_GOAL_POLICY_FILE_VALIDATION_REPORT=evidence/goal-policy-file-validation.json
npm run check:progressive-horizon-goals -- --source-horizon H2 --next-horizon H3 --minimum-goal-increase 1 --policy-key H2->H3 --horizon-status-file docs/HORIZON_STATUS.json
npm run check:goal-policy-coverage -- --source-horizon H2 --until-horizon H26 --require-positive-pending-min --horizon-status-file docs/HORIZON_STATUS.json
npm run audit:goal-policy-readiness -- --source-horizon H2 --max-target-horizon H26 --horizon-status-file docs/HORIZON_STATUS.json
 npm run promote:horizon -- --horizon H2 --next-horizon H3 --horizon-status-file docs/HORIZON_STATUS.json --evidence-dir evidence --allow-horizon-mismatch --goal-policy-key H2->H3 --strict-goal-policy-gates --require-goal-policy-file-validation --goal-policy-file-validation-until-horizon H3
 npm run run:h2-promotion -- --evidence-dir evidence --horizon-status-file docs/HORIZON_STATUS.json --runtime-env-file "$HOME/.openclaw/run/gateway.env" --allow-horizon-mismatch --skip-cutover-readiness --goal-policy-key H2->H3 --strict-goal-policy-gates --require-goal-policy-file-validation --goal-policy-file-validation-until-horizon H3
npm run check:stage-promotion -- --target-stage canary
npm run promote:stage -- --target-stage canary --dry-run
npm run run:stage-drill -- --target-stage canary --dry-run --evidence-selection-mode latest-passing
npm run run:h2-drill-suite -- --dry-run --evidence-dir evidence
npm run evaluate:auto-rollback-policy -- --stage canary --evidence-dir evidence
npm run calibrate:rollback-thresholds -- --stage majority --evidence-dir evidence
npm run run:supervised-rollback-simulation -- --stage majority --evidence-dir evidence --horizon-status-file docs/HORIZON_STATUS.json --runtime-env-file "$HOME/.openclaw/run/gateway.env" --allow-horizon-mismatch --skip-cutover-readiness
npm run run:h2-closeout -- --evidence-dir evidence --horizon-status-file docs/HORIZON_STATUS.json --runtime-env-file "$HOME/.openclaw/run/gateway.env" --allow-horizon-mismatch --skip-cutover-readiness
npm run validate:all
npm run cutover:stage -- canary
npm run cutover:rollback
```

`npm run validate:merge-bundle` uses existing latest passing reports by default and writes a top-level manifest:
- `evidence/merge-bundle-validation-*.json`

## Repository Goals

- Keep current Eve production behavior safe while converging to one runtime.
- Treat Eve and Hermes as pinned source inputs.
- Route each message through one policy engine with structured trace and failure classification.

## Source Inputs

- Eve source: `openclaw` (local path or git remote, pinned by commit).
- Hermes source: `NousResearch/hermes-agent` (pinned by commit).

Use `scripts/bootstrap-sources.sh` for first import and `scripts/sync-sources.sh` for repeatable updates.

## Quick Start

```bash
cd /workspace
npm install
cp .env.example .env
npm run bootstrap:sources
npm run check
npm test
```

## Dispatch CLI

Run one unified-dispatch request with explicit message envelope:

```bash
npm run dispatch -- --text "check project status" --chat-id 123 --message-id 456
```

Key environment controls are in `.env.example`.
