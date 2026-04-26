# Cloud Agent Handoff

Use this document when one cloud agent hands execution to another. The objective is to preserve context in-repo and avoid hidden assumptions.

## Startup Procedure for a Fresh Agent

1. Read these files in order:
   - `README.md` ("Start Here (Cloud Agents)" section)
   - `AGENTS.md`
   - `docs/PROJECT_VISION.md`
   - `docs/MASTER_EXECUTION_CHECKLIST.md`
   - `docs/NEXT_LONG_HORIZON_ACTION_PLAN.md`
2. Install and verify:
   - `npm install`
   - `npm run check`
   - `npm test`
3. Confirm runtime command compiles and runs:
   - `npm run dispatch -- --text "startup verification" --chat-id 1 --message-id 1`

## Baseline Status Fields to Record

When taking over, capture and report:

- Current branch name and latest commit
- Current phase from `docs/MASTER_EXECUTION_CHECKLIST.md`
- Current horizon status from `docs/HORIZON_STATUS.json` (`activeHorizon`, `state`, `blockers`)
- Whether contracts and tests pass
- Whether rollout scripts are operational in this environment
- Any blockers (missing source paths, unavailable dispatch scripts, or missing secrets)

## Required PR Deliverables

Every PR should include:

- What phase/checklist gate the work advances
- Files changed
- Commands executed and outcomes
- Remaining risks or explicit non-goals

## Operator-Safe Constraints

- Never remove rollback controls.
- Keep fail-closed mode supported.
- Preserve canonical `traceId` continuity from envelope to response.
- Keep explicit lane directives (`@cursor`, `@hermes`) deterministic.

## Cutover and Rollback Commands

Stage:

```bash
npm run cutover:stage -- canary
```

Rollback:

```bash
npm run cutover:rollback
```

## Evidence Expectations

Before marking a phase complete, include artifacts from:

- `npm run check`
- `npm test`
- `npm run validate:failure-injection`
- `npm run validate:soak`
- `UNIFIED_EVIDENCE_REQUIRE_FAILURE_SCENARIOS=1 npm run validate:evidence-summary`
- `npm run validate:regression-eve-primary`
- `npm run validate:cutover-readiness`
- `npm run validate:release-readiness`
- `npm run validate:initial-scope`
- `npm run validate:merge-bundle`
- `npm run validate:manifest-schemas`
- `npm run verify:merge-bundle -- --evidence-dir evidence --latest`
- `npm run validate:horizon-status`
- `npm run validate:horizon-closeout -- --horizon H1 --target-next H2`
- `npm run validate:h2-closeout`
- `npm run check:stage-promotion-readiness -- --target-stage <canary|majority|full> --evidence-dir evidence`
- `npm run promote:stage -- --target-stage <canary|majority|full> --dry-run`
- `npm run evaluate:auto-rollback-policy -- --stage <canary|majority|full> --evidence-dir evidence`
- `npm run run:stage-drill -- --target-stage <canary|majority|full> --evidence-dir evidence --dry-run`
- `npm run run:h2-drill-suite -- --evidence-dir evidence --horizon-status-file docs/HORIZON_STATUS.json --dry-run`
- `npm run calibrate:rollback-thresholds -- --stage <canary|majority|full> --evidence-dir evidence`
- `npm run run:supervised-rollback-simulation -- --stage majority --evidence-dir evidence --horizon-status-file docs/HORIZON_STATUS.json --env-file "$HOME/.openclaw/run/gateway.env" --allow-horizon-mismatch`
- `npm run run:h2-closeout -- --evidence-dir evidence --horizon-status-file docs/HORIZON_STATUS.json --env-file "$HOME/.openclaw/run/gateway.env" --allow-horizon-mismatch`
- `npm run promote:horizon -- --horizon H2 --next-horizon H3 --horizon-status-file docs/HORIZON_STATUS.json --evidence-dir evidence --allow-horizon-mismatch`

Keep evidence under `evidence/` when possible so subsequent agents can inspect prior runs.

The merge bundle workflow writes:
- bundle validation manifest in `evidence/merge-bundle-validation-*.json` (or `UNIFIED_MERGE_BUNDLE_MANIFEST_PATH`)
- packaged bundle directory `evidence/merge-readiness-bundle-*`
- compressed archive `evidence/merge-readiness-bundle-*.tar.gz`

Schema validation expectations:
- release-readiness, merge-bundle, and merge-bundle-validation manifests are validated before write.
- re-validate latest schema-compatible manifests under `evidence/` with:
  - `npm run validate:manifest-schemas`
- verify latest merge bundle package + archive contents with:
  - `npm run verify:merge-bundle -- --evidence-dir evidence --latest`
- horizon tracking metadata is machine-validated via:
  - `npm run validate:horizon-status`
- horizon closeout readiness is machine-validated via:
  - `npm run validate:horizon-closeout -- --horizon <H1|H2|H3|H4|H5> --target-next <H2|H3|H4|H5>`
- dedicated H2 closeout gate:
  - `npm run validate:h2-closeout`
  - enforces H2-scoped required evidence (`h2-drill-suite`, rollback threshold calibration, supervised rollback simulation) when listed in `requiredEvidence`
- single H2 closeout orchestrator:
  - `npm run run:h2-closeout -- --evidence-dir evidence --horizon-status-file docs/HORIZON_STATUS.json --env-file <gateway.env> --allow-horizon-mismatch`
  - executes calibration + supervised rollback simulation + H2 closeout gate in one run
  - emits unified manifest: `evidence/h2-closeout-run-*.json`
- horizon state promotion after passing closeout:
  - `npm run promote:horizon -- --horizon <H1|H2|H3|H4> --next-horizon <H2|H3|H4|H5> --horizon-status-file docs/HORIZON_STATUS.json --evidence-dir evidence`
  - optional `--closeout-file <path>` to consume a pinned closeout artifact instead of running `validate:horizon-closeout`
  - optional `--closeout-run-file <path>` to consume a pinned `run:h2-closeout` manifest and reuse its exact closeout artifact snapshot
  - writes promotion manifest: `evidence/horizon-promotion-<source>-to-<next>-*.json`
- stage promotion readiness can be machine-checked with:
  - `npm run check:stage-promotion-readiness -- --target-stage <canary|majority|full> --evidence-dir evidence`
- auto-rollback policy decisions can be machine-evaluated with:
  - `npm run evaluate:auto-rollback-policy -- --stage <canary|majority|full> --evidence-dir evidence`
  - optional explicit artifact pinning flags:
    - `--validation-summary-file <path>`
    - `--cutover-readiness-file <path>`
    - `--release-readiness-file <path>`
    - `--stage-promotion-readiness-file <path>`
  - optional artifact selection mode:
    - `--evidence-selection-mode latest` (default)
    - `--evidence-selection-mode latest-passing` (prefer newest passing artifacts when explicit file paths are not provided)
- stage promotion readiness and drill commands support evidence selection mode:
  - `--evidence-selection-mode latest` (default)
  - `--evidence-selection-mode latest-passing` (prefers newest passing manifests before newest fallback)
- stage promotion can be executed through a single gated command:
  - `npm run promote:stage -- --target-stage <canary|majority|full> --env-file <gateway.env>`
  - add `--dry-run` to verify readiness without changing env values
- staged drill orchestration can evaluate promotion + rollback policy in one command:
  - `npm run run:stage-drill -- --target-stage <canary|majority|full> --evidence-dir evidence`
  - add `--auto-apply-rollback` only for supervised incident simulation
- h2 suite orchestration can run canary + majority + rollback-trigger simulation in one command:
  - `npm run run:h2-drill-suite -- --evidence-dir evidence --horizon-status-file docs/HORIZON_STATUS.json`
  - adds suite manifest: `evidence/h2-drill-suite-*.json`
  - add `--evidence-selection-mode latest-passing` to reduce stale-failing artifact pickup during replay runs
  - use `--strict-horizon-target` when enforcing active-horizon stage matching during suite runs
- rollback threshold calibration can produce policy inputs from recent validation summaries:
  - `npm run calibrate:rollback-thresholds -- --stage <canary|majority|full> --evidence-dir evidence`
  - emits `evidence/rollback-threshold-calibration-<stage>-*.json` with `recommendedPolicyArgs`
- supervised rollback auto-apply simulation can run one gated drill + restoration verification:
  - `npm run run:supervised-rollback-simulation -- --stage majority --evidence-dir evidence --horizon-status-file docs/HORIZON_STATUS.json --env-file <gateway.env> --allow-horizon-mismatch`
  - emits `evidence/supervised-rollback-simulation-*.json`
  - add `--skip-cutover-readiness` only for CI/test harnesses that use synthetic gateway env files
- validate a single file with:
  - `npm run validate:manifest-schema -- --type release-readiness --file <path>`
  - `npm run validate:manifest-schema -- --type merge-bundle --file <path>`
  - `npm run validate:manifest-schema -- --type merge-bundle-validation --file <path>`

By default, `npm run validate:merge-bundle` consumes latest existing passing release-readiness + initial-scope reports.
Set `UNIFIED_MERGE_BUNDLE_RUN_RELEASE_READINESS=1` and/or `UNIFIED_MERGE_BUNDLE_RUN_INITIAL_SCOPE=1`
to force regeneration before packaging.
