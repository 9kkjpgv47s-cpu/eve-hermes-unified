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
  - strict option: `UNIFIED_INITIAL_SCOPE_REQUIRE_GOAL_POLICY_VALIDATION=1 npm run validate:initial-scope`
- strict release-readiness policy-file evidence gate:
  - `UNIFIED_RELEASE_READINESS_REQUIRE_GOAL_POLICY_FILE_VALIDATION=1 npm run validate:release-readiness`
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
- `npm run run:h2-promotion -- --evidence-dir evidence --horizon-status-file docs/HORIZON_STATUS.json --env-file "$HOME/.openclaw/run/gateway.env" --allow-horizon-mismatch`
- `npm run audit:goal-policy-readiness -- --source-horizon H2 --until-horizon H5 --horizon-status-file docs/HORIZON_STATUS.json`

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
  - closeout release evidence now fail-closes on goal-policy signals:
    - `validate:release-readiness` evidence must report and pass `checks.goalPolicyFileValidationPassed`
    - `validate:initial-scope` evidence must report and pass propagated release goal-policy status
    - `validate:merge-bundle` evidence must report and pass both release + initial-scope goal-policy propagation checks
    - `verify:merge-bundle` evidence must report and pass both release + initial-scope goal-policy propagation checks
- dedicated H2 closeout gate:
  - `npm run validate:h2-closeout`
  - enforces H2-scoped required evidence (`h2-drill-suite`, rollback threshold calibration, supervised rollback simulation) when listed in `requiredEvidence`
- single H2 closeout orchestrator:
  - `npm run run:h2-closeout -- --evidence-dir evidence --horizon-status-file docs/HORIZON_STATUS.json --env-file <gateway.env> --allow-horizon-mismatch`
  - executes calibration + supervised rollback simulation + H2 closeout gate in one run
  - emits unified manifest: `evidence/h2-closeout-run-*.json`
- horizon state promotion after passing closeout:
  - `npm run promote:horizon -- --horizon <H1|H2|H3|H4> --next-horizon <H2|H3|H4|H5> --horizon-status-file docs/HORIZON_STATUS.json --evidence-dir evidence`
  - optional `--goal-policy-file docs/GOAL_POLICIES.json` to force an explicit policy source
  - when `--goal-policy-file` is omitted, promotion auto-detects a sibling `GOAL_POLICIES.json` next to `--horizon-status-file`; if not present, it falls back to `goalPolicies` in horizon status
  - optional `--closeout-file <path>` to consume a pinned closeout artifact instead of running `validate:horizon-closeout`
  - fail-closed enforcement for `--closeout-file`:
    - pinned closeout must report matching transition scope:
      - `closeout.horizon` must equal requested `--horizon`
      - `closeout.nextHorizon` must equal requested `--next-horizon`
      - legacy fallback accepted: `checks.nextHorizon.selectedNextHorizon` must equal `--next-horizon`
  - optional `--closeout-run-file <path>` to consume a pinned `run:h2-closeout` manifest and reuse its exact closeout artifact snapshot
  - fail-closed enforcement for `--closeout-run-file`:
    - closeout run must report matching transition scope:
      - `horizon.source` must equal requested `--horizon`
      - `horizon.next` must equal requested `--next-horizon`
      - if `horizon` block is omitted (legacy manifests), inferred `checks.nextHorizon` must match `--next-horizon`
      - source mismatch can be bypassed only with `--allow-inactive-source-horizon` (replay-only)
    - closeout run must report `checks.h2CloseoutGatePass=true`
    - closeout run must report `checks.supervisedSimulationStageGoalPolicyPropagationReported=true`
    - closeout run must report `checks.supervisedSimulationStageGoalPolicyPropagationPassed=true`
  - optional `--require-progressive-goals --minimum-goal-increase <n>` to require the next horizon to have at least `<n>` more planned actions than the source horizon
  - optional `--goal-policy-key <Hn->Hm>` to enforce a named transition policy from `goalPolicies` (for tagged action mix and stricter thresholds)
  - optional `--require-goal-policy-coverage` to require transition policy coverage from the source horizon through `--until-horizon` before promotion
  - optional `--required-policy-transitions H2->H3,H3->H4,...` to explicitly pin transitions that must have policy entries
  - optional `--require-policy-tagged-targets` to require each covered transition policy to declare tagged action targets
  - optional `--require-goal-policy-readiness-audit` to require passing readiness-audit matrix before promotion
  - optional `--goal-policy-readiness-audit-out <path>` to pin readiness audit report output path
  - optional `--goal-policy-readiness-audit-max-target-horizon <H3|H4|H5>` to bound readiness audit horizon window
  - optional `--require-goal-policy-readiness-tagged-targets` to require tagged requirements in readiness audit
  - optional `--require-goal-policy-readiness-positive-pending-min` to require positive pending minimum targets in readiness audit
  - optional `--require-positive-pending-policy-min` to require each covered transition policy to set `minPendingNextActions > 0`
  - optional `--require-goal-policy-file-validation` to run dedicated policy-file validation before progressive/coverage/readiness gates
  - optional `--goal-policy-file-validation-out <path>` to pin validation artifact path
  - optional `--goal-policy-file-validation-until-horizon <H3|H4|H5>` to set validation window
  - optional `--allow-goal-policy-file-validation-fallback` to allow non-file policy source (CI/backfill only)
  - optional `--strict-goal-policy-gates` (alias: `--require-strict-goal-policy-gates`) to enable a one-flag strict profile:
    - enables progressive goals + goal-policy coverage + goal-policy readiness audit gates
    - enforces tagged targets + positive pending mins in both coverage and readiness gates
    - defaults to a single-transition scope (`<source>-><next>`) unless explicit horizon windows or transition sets are provided
  - optional goal-policy coverage artifact:
    - `evidence/goal-policy-coverage-<source>-to-<until>-*.json`
  - progressive-goals report artifact (when enabled):
    - `evidence/progressive-goals-check-<source>-to-<next>-*.json`
  - writes promotion manifest: `evidence/horizon-promotion-<source>-to-<next>-*.json`
- explicit dedicated goal-policy manifest validation gate:
  - `npm run validate:goal-policy-file -- --horizon-status-file docs/HORIZON_STATUS.json`
  - optional `--goal-policy-file <path>` to pin a specific policy file
  - validates transition-policy schema and required transition window defaults (`H2->H3`, `H3->H4`, `H4->H5`)
  - emits deterministic validation artifact:
    - `evidence/goal-policy-file-validation-*.json`
- initial-scope gate can require release-readiness to include and pass goal-policy validation evidence:
  - `UNIFIED_INITIAL_SCOPE_REQUIRE_GOAL_POLICY_VALIDATION=1 npm run validate:initial-scope`
  - fails if `release-readiness.checks.goalPolicyFileValidationPassed !== true`
- one-command H2 promotion flow (closeout + promotion):
  - `npm run run:h2-promotion -- --evidence-dir evidence --horizon-status-file docs/HORIZON_STATUS.json --env-file <gateway.env> --allow-horizon-mismatch`
  - optional `--goal-policy-file docs/GOAL_POLICIES.json` to force policy checks to use a dedicated policy document
  - when omitted, runner inherits the same auto-discovery order as `promote:horizon` (`GOAL_POLICIES.json` sibling first, then horizon-status fallback)
  - executes `run:h2-closeout` then `promote:horizon --closeout-run-file ...` in one command
  - optional `--require-progressive-goals --minimum-goal-increase <n>` to enforce longer next-horizon action runway before promotion
  - optional `--goal-policy-key <Hn->Hm>` to require transition-specific action-tag minimums from `goalPolicies`
  - optional `--require-goal-policy-coverage --goal-policy-coverage-until-horizon <H3|H4|H5>` to require policy coverage beyond the immediate transition
  - optional `--required-policy-transitions <csv>` and `--require-policy-tagged-targets` for strict multi-transition policy gating
  - optional `--require-goal-policy-validation` to run `validate:goal-policy-file` as a pre-promotion gate
  - optional `--goal-policy-validation-out <path>` to pin validator output artifact
  - optional `--goal-policy-validation-until-horizon <H3|H4|H5>` to set validation transition window
  - optional `--allow-goal-policy-validation-fallback` to allow fallback source in validator (CI/backfill only)
  - optional `--require-goal-policy-readiness-audit` to run readiness audit gate as part of promotion
  - optional `--goal-policy-readiness-audit-max-target-horizon <H3|H4|H5>` to set readiness audit horizon window
  - optional `--require-goal-policy-readiness-tagged-targets` and `--require-goal-policy-readiness-positive-pending-min` for stricter readiness criteria
  - optional `--require-positive-pending-policy-min` to require positive pending-action floors in covered policies
  - optional `--strict-goal-policy-gates` (alias: `--require-strict-goal-policy-gates`) to enforce the full strict policy profile with one flag
  - fail-closed pre-promotion closeout artifact checks:
    - runner validates `closeoutOut` referenced by closeout-run before invoking `promote:horizon`
    - rejects when pinned closeout artifact file is missing
    - rejects when pinned closeout artifact `pass !== true`
    - rejects when pinned closeout artifact transition metadata does not match expected `H2-><next>`
    - rejects when closeout-run and pinned closeout artifact transitions disagree, even if each individually appears valid
  - fail-closed pre-promotion closeout-run transition checks:
    - rejects when closeout-run does not report resolvable source horizon metadata
    - rejects when closeout-run does not report resolvable next-horizon metadata
    - accepts legacy fallback fields (`checks.sourceHorizon`, `checks.nextHorizon`) when top-level `horizon` block is absent
  - writes unified run manifest: `evidence/h2-promotion-run-*.json`
- goal-policy readiness can be audited independently (without promotion):
  - `npm run audit:goal-policy-readiness -- --source-horizon <H1|H2|H3|H4> --until-horizon <H2|H3|H4|H5> --horizon-status-file docs/HORIZON_STATUS.json --goal-policy-file docs/GOAL_POLICIES.json`
  - when `--goal-policy-file` is omitted, audit auto-detects a sibling `GOAL_POLICIES.json` before falling back to horizon-status policy definitions
  - writes readiness matrix: `evidence/goal-policy-readiness-*.json`
- stage promotion readiness can be machine-checked with:
  - `npm run check:stage-promotion-readiness -- --target-stage <canary|majority|full> --evidence-dir evidence`
  - fail-closed enforcement: selected release-readiness evidence must report `checks.goalPolicyFileValidationPassed=true`
  - fail-closed enforcement: selected `validate:merge-bundle` and `verify:merge-bundle` evidence must each report and pass both release + initial-scope goal-policy propagation checks
- auto-rollback policy decisions can be machine-evaluated with:
  - `npm run evaluate:auto-rollback-policy -- --stage <canary|majority|full> --evidence-dir evidence`
  - fail-closed enforcement: selected release-readiness evidence must report `checks.goalPolicyFileValidationPassed=true`
  - fail-closed enforcement: selected stage-promotion-readiness evidence must report and pass all propagated bundle goal-policy checks:
    - `checks.mergeBundleGoalPolicyValidationReported=true`
    - `checks.mergeBundleGoalPolicyValidationPassed=true`
    - `checks.mergeBundleInitialScopeGoalPolicyValidationReported=true`
    - `checks.mergeBundleInitialScopeGoalPolicyValidationPassed=true`
    - `checks.bundleVerificationGoalPolicyValidationReported=true`
    - `checks.bundleVerificationGoalPolicyValidationPassed=true`
    - `checks.bundleVerificationInitialScopeGoalPolicyValidationReported=true`
    - `checks.bundleVerificationInitialScopeGoalPolicyValidationPassed=true`
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
  - fail-closed enforcement: rollback-policy output must report and pass all propagated stage-promotion bundle goal-policy checks (merge-bundle + bundle-verification, release + initial-scope)
- h2 suite orchestration can run canary + majority + rollback-trigger simulation in one command:
  - `npm run run:h2-drill-suite -- --evidence-dir evidence --horizon-status-file docs/HORIZON_STATUS.json`
  - adds suite manifest: `evidence/h2-drill-suite-*.json`
  - add `--evidence-selection-mode latest-passing` to reduce stale-failing artifact pickup during replay runs
  - use `--strict-horizon-target` when enforcing active-horizon stage matching during suite runs
  - fail-closed enforcement: hold-path and rollback-simulation steps require rollback-policy stage-promotion goal-policy propagation checks to be reported and passed
- rollback threshold calibration can produce policy inputs from recent validation summaries:
  - `npm run calibrate:rollback-thresholds -- --stage <canary|majority|full> --evidence-dir evidence`
  - emits `evidence/rollback-threshold-calibration-<stage>-*.json` with `recommendedPolicyArgs`
- supervised rollback auto-apply simulation can run one gated drill + restoration verification:
  - `npm run run:supervised-rollback-simulation -- --stage majority --evidence-dir evidence --horizon-status-file docs/HORIZON_STATUS.json --env-file <gateway.env> --allow-horizon-mismatch`
  - fail-closed enforcement: selected `supervised-stage-drill-*` output must report and pass rollback-policy stage-promotion goal-policy propagation checks
    - requires `checks.rollbackStagePromotionGoalPolicyPropagationReported=true`
    - requires `checks.rollbackStagePromotionGoalPolicyPropagationPassed=true`
  - emits `evidence/supervised-rollback-simulation-*.json`
- h2 closeout orchestration fail-closes unless supervised rollback simulation reports stage-drill propagation checks:
  - `checks.stageDrillGoalPolicyPropagationReported=true`
  - `checks.stageDrillGoalPolicyPropagationPassed=true`
  - add `--skip-cutover-readiness` only for CI/test harnesses that use synthetic gateway env files
- validate a single file with:
  - `npm run validate:manifest-schema -- --type release-readiness --file <path>`
  - `npm run validate:manifest-schema -- --type merge-bundle --file <path>`
  - `npm run validate:manifest-schema -- --type merge-bundle-validation --file <path>`

By default, `npm run validate:merge-bundle` consumes latest existing passing release-readiness + initial-scope reports.
Set `UNIFIED_MERGE_BUNDLE_RUN_RELEASE_READINESS=1` and/or `UNIFIED_MERGE_BUNDLE_RUN_INITIAL_SCOPE=1`
to force regeneration before packaging.
The merge-bundle validation wrapper also enforces initial-scope goal-policy propagation:
- initial-scope manifest must report `checks.releaseReadinessGoalPolicyValidationPassed === true`
- failure is surfaced as `initial_scope_goal_policy_validation_not_passed` in `merge-bundle-validation-*` output
- release-readiness manifest must report `checks.goalPolicyFileValidationPassed === true`
- missing/failed release signal surfaces as:
  - `missing_release_goal_policy_validation_check`
  - `release_goal_policy_validation_not_passed`
