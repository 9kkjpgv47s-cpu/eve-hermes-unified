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

## Unified dispatch ingress (H4)

- **Canonical binary**: `src/bin/unified-dispatch.ts` — only location that may construct `EveAdapter` / `HermesAdapter` for production-shaped runs.
- **CI gate**: `npm run validate:unified-entrypoints` scans `src/**/*.ts` for stray adapter constructors.
- **Contract**: `UNIFIED_DISPATCH_CONTRACT_VERSION` in `src/contracts/schema-version.ts`; fixtures under `test/fixtures/contracts/` validate with `validateUnifiedDispatchResult`.
- **Deprecation map**: `docs/LEGACY_ENTRYPOINT_DEPRECATION_MAP.md`.

## Tenant, region, and bounded automation (H5)

- **Envelope fields**: optional `tenantId` and `regionId` on `UnifiedMessageEnvelope`; validated in `validateEnvelope` when set.
- **Dispatch tenant gate**: `UNIFIED_TENANT_ALLOWLIST` / `UNIFIED_TENANT_DENYLIST` — evaluated before routing or capability execution; failures return `policy_failure` without touching lane adapters.
- **Capability tenant gate**: `UNIFIED_CAPABILITY_ALLOWED_TENANT_IDS` / `UNIFIED_CAPABILITY_DENIED_TENANT_IDS` — applies to `@cap` flows via capability policy.
- **Memory isolation**: capability execution uses `TenantScopedUnifiedMemoryStore` when `tenantId` is present (namespace prefix `tenantId::`).
- **Standby region routing**: `UNIFIED_ROUTER_STANDBY_REGION` — when it equals `envelope.regionId`, primary and fallback lanes swap for failover drills (skipped when fallback is `none`).
- **Lane env passthrough**: Eve receives `EVE_TASK_DISPATCH_TENANT_ID` / `EVE_TASK_DISPATCH_REGION_ID`; Hermes receives `HERMES_UNIFIED_TENANT_ID` / `HERMES_UNIFIED_REGION_ID` when set.
- **Evidence scripts**: `npm run validate:tenant-isolation`, `npm run rehearse:region-failover`, `npm run rehearse:agent-remediation` (read-only bundle manifest).
- **H5 closeout**: `npm run run:h5-closeout-evidence` writes `evidence/h5-closeout-evidence-*.json`; gate with `npm run validate:h5-closeout`. Stage-promotion readiness is skipped when the next horizon is already **completed** (retroactive closeout) or for terminal **H16** (no downstream horizon).

## Sustainment assurance (terminal H16)

- **Older bundles** (historical): `run:h6-assurance-bundle` … through **`run:h15-assurance-bundle`**.
- **H16 bundle** (current): `npm run run:h16-assurance-bundle` chains **`run-h15-assurance-bundle.mjs`** plus **`validate:goal-policy-file`** (through **H16**) and **`validate:manifest-schemas`** over **`evidence/`**.
- **Closeout gate**: `npm run validate:h16-closeout` (terminal horizon skips downstream stage-promotion in `validate-horizon-closeout`; older horizons remain for replay).
- **Horizon index**: orchestration scripts include **H16** as the terminal horizon sequence entry.
- **Periodic verification**: `npm run verify:sustainment-loop` chains horizon status + **`run:h31-assurance-bundle`** (H30 stack + **`validate-horizon-status`** on `docs/HORIZON_STATUS.json` after the manifest-schema slice) + **`validate:evidence-volume`**. Run **`npm run validate:h17-closeout`** … **`npm run validate:h31-closeout`** separately when required (do not nest closeout inside the sustainment loop). Legacy: **`verify:sustainment-loop:h15-legacy`** … **`h6-legacy`**.

## Dispatch audit rotation (H7)

- **Env**: `UNIFIED_DISPATCH_AUDIT_ROTATION_MAX_BYTES` (0 = off), `UNIFIED_DISPATCH_AUDIT_ROTATION_RETAIN_COUNT` (default 8; minimum enforced as 1 generation).
- **Behavior**: before each append in `src/bin/unified-dispatch.ts`, when max-bytes is set, the active JSONL may rotate to `${path}.${timestamp}.jsonl`; oldest archives are pruned to satisfy retention.

## Capability policy authorization audit (H8)

- **Env**: `UNIFIED_CAPABILITY_POLICY_AUDIT_LOG_PATH` — append-only JSONL for each `@cap` policy evaluation (allowed/denied + `policyReason`). Defaults to `dirname(UNIFIED_AUDIT_LOG_PATH)/unified-capability-policy-audit.jsonl` when unset.
- **Runtime**: `UnifiedCapabilityEngine` logs after `authorize()` when the path is configured; preflight checks parent directory writable.

## File-backed unified memory crash safety (H9)

- **`FileUnifiedMemoryStore`** commits snapshots by writing **`${UNIFIED_MEMORY_FILE_PATH}.tmp`** then **`rename`** into place so readers rarely observe partial JSON during crashes (same directory as the primary path).

## Dispatch durability queue retention (H10)

- **Env**: **`UNIFIED_DISPATCH_DURABILITY_QUEUE_RETENTION_NON_TERMINAL_MAX`** (alias **`DISPATCH_QUEUE_RETENTION_NON_TERMINAL_MAX`**) — max **`dispatched`** / **`failed`** rows to keep (**oldest** pruned first after each mutation). **`0`** = unlimited. **`pending`** entries are never removed by pruning.
- **Runtime**: **`FileDispatchDurabilityQueue`** passes retention into each atomic queue save via **`pruneCompletedDispatchQueueEntries`**.

## Capability policy audit rotation (H11)

- **Env**: **`UNIFIED_CAPABILITY_POLICY_AUDIT_ROTATION_MAX_BYTES`** (alias **`CAPABILITY_POLICY_AUDIT_ROTATION_MAX_BYTES`**, 0 = off), **`UNIFIED_CAPABILITY_POLICY_AUDIT_ROTATION_RETAIN_COUNT`** (alias **`CAPABILITY_POLICY_AUDIT_ROTATION_RETAIN_COUNT`**, default 8).
- **Behavior**: before each capability policy audit append in **`appendCapabilityPolicyAuditLog`**, when max-bytes is set, rotate active JSONL to **`${path}.${timestamp}.jsonl`** (same naming pattern as dispatch audit); **`UnifiedCapabilityEngine`** passes rotation when configured via **`unified-dispatch`** runtime config.

## Dispatch durability queue replay attempt bound (H12)

- **Env**: **`UNIFIED_DISPATCH_DURABILITY_QUEUE_REPLAY_MAX_ATTEMPTS_PER_ENTRY`** (alias **`DISPATCH_QUEUE_REPLAY_MAX_ATTEMPTS_PER_ENTRY`**) — max replay attempts per **`pending`** entry before marking **`failed`** with reason **`replay_max_attempts_exceeded`**. **`0`** = unlimited (legacy behavior).
- **Runtime**: **`replayPendingDispatches`** compares **`entry.attempts`** to the configured cap before **`incrementAttempt`**; **`FileDispatchDurabilityQueue`** receives the cap from **`unified-dispatch`** runtime config.

## CI soak SLO drift gate (H13)

- **Scripts**: **`scripts/run-ci-soak-slo-gate.mjs`** runs **`soak-simulate.sh`** (iterations from **`UNIFIED_CI_SOAK_ITERATIONS`**, default **25**) then **`summarize-soak-report.mjs`** with **`UNIFIED_SOAK_FAIL_ON_DRIFT=1`** so trace rate, success rate, and P95 latency thresholds fail the process on drift.
- **Evidence**: **`evidence/ci-soak-slo-gate-*.json`** records **`checks.ciSoakDriftPass`** and any **`driftAlarms`** from the summarizer.
- **CI**: **`unified-ci`** runs **`npm run run:h16-assurance-bundle`** (includes H15 sub-bundle + goal-policy validation + manifest schema sweep) before the full **`validate:all`** chain.

## Shell unified dispatch ingress (H14)

- **`scripts/unified-dispatch-runner.sh`**: **`resolve_unified_dispatch`** sets **`UNIFIED_DISPATCH_CMD`** to **`node dist/.../unified-dispatch.js`** when built, else **`tsx src/bin/unified-dispatch.ts`**. Honors **`UNIFIED_DISPATCH_BIN`** when pointing at an existing file.
- **`scripts/validate-shell-unified-dispatch.sh`**: smoke-check that the resolver succeeds (used by **`run-h14-assurance-bundle.mjs`**).
- **Refactors**: **`soak-simulate.sh`**, **`regression-eve-primary.sh`**, **`verify-cutover-readiness.sh`**, **`failure-injection-smoke.sh`** invoke dispatch only via the resolver so **`validate:all`** works **before** **`npm run build`** in clean checkouts.

## Shell dispatch CI convergence (H15)

- **`scripts/validate-shell-unified-dispatch-ci.mjs`**: scans **`scripts/*.sh`** except **`unified-dispatch-runner.sh`**; fails on **`dist/src/bin/unified-dispatch`** substrings or **`node`/`tsx`** lines that invoke **`unified-dispatch`** directly (use **`UNIFIED_DISPATCH_CMD`** after **`resolve_unified_dispatch`**).
- **`npm run run:h15-assurance-bundle`**: H14 sub-bundle + CI scan (**`shellUnifiedDispatchCiScanPass`**).

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
- Both commands are cloud-self-priming:
  - they set lane/runtime defaults internally so host-specific Eve/Hermes paths do not block evidence generation
  - override only when needed via `UNIFIED_SOAK_EVE_DISPATCH_SCRIPT`, `UNIFIED_SOAK_HERMES_LAUNCH_COMMAND`, and `UNIFIED_SOAK_EVE_DISPATCH_RESULT_PATH`
- `UNIFIED_EVIDENCE_REQUIRE_FAILURE_SCENARIOS=1 npm run validate:evidence-summary`
- `npm run validate:regression-eve-primary`
- `npm run validate:cutover-readiness`
- `npm run validate:release-readiness`
- `npm run validate:initial-scope`
  - strict option: `UNIFIED_INITIAL_SCOPE_REQUIRE_GOAL_POLICY_VALIDATION=1 npm run validate:initial-scope`
- strict release-readiness policy-file evidence gate:
  - `UNIFIED_RELEASE_READINESS_REQUIRE_GOAL_POLICY_FILE_VALIDATION=1 npm run validate:release-readiness`
- `npm run validate:merge-bundle`
- `npm run bundle:merge-readiness` (writes timestamped `merge-readiness-bundle-*` dir + archive)
- `npm run validate:manifest-schemas`
- `npm run verify:merge-bundle -- --latest`
  - if `merge-readiness-bundle-latest` alias is missing, verifier falls back to the newest timestamped merge bundle directory
  - optional explicit pin: `npm run verify:merge-bundle -- --bundle-manifest evidence/merge-readiness-bundle-<timestamp>/merge-readiness-manifest.json`
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
  - `npm run validate:horizon-closeout -- --horizon <H1|H2|H3|H4|H5|H6> --target-next <H2|H3|H4|H5|H6>`
  - closeout release evidence now fail-closes on goal-policy signals:
    - `validate:release-readiness` evidence must report and pass `checks.goalPolicyFileValidationPassed`
    - `validate:initial-scope` evidence must report and pass propagated release goal-policy status
    - `validate:merge-bundle` evidence must report and pass both release + initial-scope goal-policy propagation checks
    - `verify:merge-bundle` evidence must report and pass both release + initial-scope goal-policy propagation checks
    - `verify:merge-bundle` evidence must also report deterministic bundle-selection provenance:
      - either `checks.latestRequested=true` with alias resolution/fallback proof, or `checks.validationManifestResolved=true`
      - and must report `files.validationManifestPath`
      - and must satisfy `bundle_verify_selection_gate_not_passed` fail-closed gate when these signals are missing/invalid
- dedicated H2 closeout gate:
  - `npm run validate:h2-closeout`
  - enforces H2-scoped required evidence (`h2-drill-suite`, rollback threshold calibration, supervised rollback simulation) when listed in `requiredEvidence`
- generalized closeout evidence command mapping for later horizons:
  - `validate:horizon-closeout` now accepts horizon-scoped drill suite aliases in `requiredEvidence`:
    - `npm run run:h2-drill-suite`
    - `npm run run:h3-drill-suite`
    - `npm run run:h4-drill-suite`
  - these aliases are verified using the same strict `h2-drill-suite` schema and fail-closed drill checks (`canaryHoldPass`, `majorityHoldPass`, rollback trigger/pass, and rollback source-consistency signals)
- single H2 closeout orchestrator:
  - `npm run run:h2-closeout -- --evidence-dir evidence --horizon-status-file docs/HORIZON_STATUS.json --env-file <gateway.env> --allow-horizon-mismatch`
  - executes calibration + supervised rollback simulation + H2 closeout gate in one run
  - emits unified manifest: `evidence/h2-closeout-run-*.json`
  - can also orchestrate later horizons with explicit scope:
    - `npm run run:h2-closeout -- --horizon <H3|H4> --next-horizon <H4|H5> --evidence-dir evidence --horizon-status-file docs/HORIZON_STATUS.json --env-file <gateway.env> --allow-horizon-mismatch`
  - for non-H2 source horizons, emitted manifest prefix is:
    - `evidence/horizon-closeout-run-<source>-*.json`
- horizon state promotion after passing closeout:
  - `npm run promote:horizon -- --horizon <H1|H2|H3|H4> --next-horizon <H2|H3|H4|H5> --horizon-status-file docs/HORIZON_STATUS.json --evidence-dir evidence`
  - optional `--goal-policy-file docs/GOAL_POLICIES.json` to force an explicit policy source
  - when `--goal-policy-file` is omitted, promotion auto-detects a sibling `GOAL_POLICIES.json` next to `--horizon-status-file`; if not present, it falls back to `goalPolicies` in horizon status
  - fail-closed policy-source integrity: promotion rejects policy files that contain duplicate transition keys in raw JSON (for example duplicate `H2->H3` entries under `transitions`)
  - optional `--closeout-file <path>` to consume a pinned closeout artifact instead of running `validate:horizon-closeout`
  - fail-closed enforcement for `--closeout-file`:
    - pinned closeout must report matching transition scope:
      - `closeout.horizon` must equal requested `--horizon`
      - `closeout.nextHorizon` must equal requested `--next-horizon`
      - legacy fallback accepted: `checks.nextHorizon.selectedNextHorizon` must equal `--next-horizon`
    - pinned closeout transition aliases must be internally consistent:
      - source aliases (`closeout.horizon`, `closeout.sourceHorizon`, `horizon.source`, etc.) must resolve to one value
      - next aliases (`closeout.nextHorizon`, `closeout.targetNextHorizon`, `checks.nextHorizon.*`, etc.) must resolve to one value
  - optional `--closeout-run-file <path>` to consume a pinned `run:h2-closeout` manifest and reuse its exact closeout artifact snapshot
  - fail-closed enforcement for `--closeout-run-file`:
    - if closeout artifact path aliases are reported, they must resolve to a single consistent path (`files.closeoutOut`, `files.closeoutFile`, top-level `closeoutOut`)
    - closeout run must report matching transition scope:
      - `horizon.source` must equal requested `--horizon`
      - `horizon.next` must equal requested `--next-horizon`
      - if `horizon` block is omitted (legacy manifests), inferred `checks.nextHorizon` must match `--next-horizon`
      - source mismatch can be bypassed only with `--allow-inactive-source-horizon` (replay-only)
    - closeout-run transition aliases must be internally consistent:
      - source aliases (`horizon.source`, `sourceHorizon`, `checks.sourceHorizon`, etc.) must resolve to one value
      - next aliases (`horizon.next`, `nextHorizon`, `checks.nextHorizon`, etc.) must resolve to one value
    - closeout run must report `checks.h2CloseoutGatePass=true`
    - closeout run must report `checks.supervisedSimulationStageGoalPolicyPropagationReported=true`
    - closeout run must report `checks.supervisedSimulationStageGoalPolicyPropagationPassed=true`
    - closeout run transition and resolved closeout artifact transition must agree (source + next), even when each independently matches requested transition via compatibility aliases
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
  - fail-closed integrity check: duplicate transition keys in raw policy JSON fail validation (`goal_policy_file_duplicate_transition_keys:*`)
  - emits deterministic validation artifact:
    - `evidence/goal-policy-file-validation-*.json`
- horizon-status schema gate also fail-closes duplicate transition keys in fallback policy definitions:
  - `npm run validate:horizon-status`
  - duplicate keys under `goalPolicies.transitions` fail with:
    - `goalPolicies duplicate transition key: <transition>`
- initial-scope gate can require release-readiness to include and pass goal-policy validation evidence:
  - `UNIFIED_INITIAL_SCOPE_REQUIRE_GOAL_POLICY_VALIDATION=1 npm run validate:initial-scope`
  - fails if `release-readiness.checks.goalPolicyFileValidationPassed !== true`
- one-command H2 promotion flow (closeout + promotion):
  - `npm run run:h2-promotion -- --evidence-dir evidence --horizon-status-file docs/HORIZON_STATUS.json --env-file <gateway.env> --allow-horizon-mismatch`
  - optional `--goal-policy-file docs/GOAL_POLICIES.json` to force policy checks to use a dedicated policy document
  - when omitted, runner inherits the same auto-discovery order as `promote:horizon` (`GOAL_POLICIES.json` sibling first, then horizon-status fallback)
  - fail-closed policy-source integrity: duplicate transition keys in external goal-policy files are rejected before promotion
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
    - runner rejects closeout-run manifests that report conflicting closeout artifact path aliases
    - runner rejects closeout-run manifests that report conflicting source/next transition aliases
    - runner rejects closeout-run manifests that report non-empty but invalid horizon tokens in transition aliases
    - runner resolves relative closeout artifact aliases relative to the closeout-run manifest directory
    - runner validates `closeoutOut` referenced by closeout-run before invoking `promote:horizon`
    - rejects when pinned closeout artifact file is missing
    - rejects when pinned closeout artifact `pass !== true`
    - rejects when pinned closeout artifact reports conflicting source/next transition aliases
    - rejects when pinned closeout artifact reports non-empty but invalid horizon tokens in transition aliases
    - rejects when pinned closeout artifact transition metadata does not match expected `H2-><next>`
    - rejects when closeout-run and pinned closeout artifact transitions disagree, even if each individually appears valid
  - fail-closed pre-promotion closeout-run transition checks:
    - rejects when closeout-run does not report resolvable source horizon metadata
    - rejects when closeout-run does not report resolvable next-horizon metadata
    - accepts legacy fallback fields (`checks.sourceHorizon`, `checks.nextHorizon`) when top-level `horizon` block is absent
  - writes unified run manifest: `evidence/h2-promotion-run-*.json`
  - supports non-H2 source horizons with explicit `--horizon`/`--next-horizon`:
    - `npm run run:h2-promotion -- --horizon H3 --next-horizon H4 --evidence-dir evidence --horizon-status-file docs/HORIZON_STATUS.json --env-file <gateway.env> --allow-horizon-mismatch --dry-run`
  - for non-H2 source horizons:
    - closeout run schema/gating uses `horizon-closeout-run` manifests
    - unified run manifest prefix becomes `evidence/horizon-promotion-run-<source>-*.json`
- goal-policy readiness can be audited independently (without promotion):
  - `npm run audit:goal-policy-readiness -- --source-horizon <H1|H2|H3|H4> --until-horizon <H2|H3|H4|H5> --horizon-status-file docs/HORIZON_STATUS.json --goal-policy-file docs/GOAL_POLICIES.json`
  - when `--goal-policy-file` is omitted, audit auto-detects a sibling `GOAL_POLICIES.json` before falling back to horizon-status policy definitions
  - writes readiness matrix: `evidence/goal-policy-readiness-*.json`
- stage promotion readiness can be machine-checked with:
  - `npm run check:stage-promotion-readiness -- --target-stage <canary|majority|full> --evidence-dir evidence`
  - fail-closed enforcement: selected release-readiness evidence must report `checks.goalPolicyFileValidationPassed=true`
  - fail-closed enforcement: selected `validate:merge-bundle` and `verify:merge-bundle` evidence must each report and pass both release + initial-scope goal-policy propagation checks
  - fail-closed enforcement: selected `verify:merge-bundle` evidence must prove deterministic bundle-selection provenance and reference the selected merge-bundle validation snapshot:
    - either `checks.latestRequested=true` with `checks.latestAliasResolved=true` or `checks.latestAliasFallbackUsed=true`
    - or `checks.validationManifestResolved=true`
    - and `files.validationManifestPath` must be reported
    - and when merge-bundle-validation artifact selection is known, `files.validationManifestPath` must match the selected `merge-bundle-validation-*.json` path
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
  - fail-closed enforcement: selected stage-promotion-readiness evidence must also report and pass bundle-verification selection provenance checks:
    - `checks.bundleVerificationSelectionSignalReported=true`
    - `checks.bundleVerificationSelectionProofPassed=true`
    - `checks.bundleVerificationValidationManifestPathReported=true`
    - `checks.bundleVerificationSelectionGateSatisfied=true`
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
