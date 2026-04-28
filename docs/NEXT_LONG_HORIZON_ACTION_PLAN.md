# Next Long-Horizon Action Plan (Post-Initial-Scope)

## Purpose

Define the execution roadmap after initial-scope merge readiness so cloud agents can continue convergence work with clear gates, evidence requirements, and rollback-safe operating constraints.

This plan starts **after** `npm run validate:initial-scope` and `npm run validate:merge-bundle` are passing.

## Operating Constraints (Carry Forward)

1. Eve-safe rollback remains one command away.
2. Unified contracts in `src/contracts/` stay canonical.
3. All changes keep machine-readable trace and failure classification.
4. Every horizon gate is backed by reproducible command evidence under `evidence/`.

## North-Star Outcomes

1. Unified runtime handles production traffic at full cutover with deterministic rollback behavior.
2. Reliability and latency SLOs are continuously enforced in CI and deployment workflows.
3. Legacy direct runtime paths are removed after parity is sustained.
4. Cloud-agent execution is self-priming, policy-governed, and auditable end-to-end.

## Horizon Gates

### Horizon H1 - Merge Operationalization Baseline

Goal: promote initial-scope assets into repeatable post-merge operating workflow.

Workstreams:
- Standardize merge bundle as release artifact input for operations.
- Add CI job parity for `check`, `test`, `build`, `validate:all`, `validate:release-readiness`, `validate:initial-scope`, and `validate:merge-bundle`.
- Define release candidate manifest policy (required fields + pass criteria) and enforce via executable schema validation gate.

Exit evidence:
- CI run with all required validation jobs passing.
- Merge bundle manifest generated in CI artifact set.
- Operator runbook section documenting artifact retrieval and verification.

Primary risks:
- CI environment drift vs local cloud-agent runtime.
- Artifact naming inconsistency across jobs.

Mitigations:
- Pin command wrappers and env defaults in repo scripts.
- Verify manifest schema in CI before publishing artifacts.

### Horizon H2 - Progressive Production Traffic Enablement

Goal: make staged production cutover continuously operable with SLO guardrails.

Workstreams:
- Integrate cutover stages (`shadow`, `canary`, `majority`, `full`) with deployment workflow controls.
- Add live SLO monitors wired to dispatch success rate, P95 latency, missing trace rate, and failure-class distribution.
- Implement operator-safe auto-rollback trigger policy for sustained gate violations.
- Enforce executable rollback decision evidence via `npm run evaluate:auto-rollback-policy`.

Exit evidence:
- Recorded canary and majority drills with explicit pass/fail gates.
- Rollback drill logs proving restoration to Eve-primary/no-fallback state.
- Alert-to-action runbook validated by simulated incident replay.

Primary risks:
- Stage transitions without synchronized config propagation.
- Alert fatigue from noisy thresholds.

Mitigations:
- Stage change verification hook before traffic promotion.
- Tune thresholds using soak/failure evidence and production baselines.

Operator drill commands (single execution paths):

```bash
npm run run:stage-drill -- \
  --target-stage canary \
  --evidence-dir evidence \
  --horizon-status-file docs/HORIZON_STATUS.json \
  --runtime-env-file "$HOME/.openclaw/run/gateway.env" \
  --canary-chats "100,200"
```

Expected artifacts:
- `evidence/stage-promotion-readiness-*.json`
- `evidence/stage-promotion-execution-*.json`
- `evidence/auto-rollback-policy-*.json`
- `evidence/stage-drill-<stage>-*.json`

H2 drill-suite command (canary + majority + rollback simulation):

```bash
npm run run:h2-drill-suite -- \
  --evidence-dir evidence \
  --horizon-status-file docs/HORIZON_STATUS.json \
  --runtime-env-file "$HOME/.openclaw/run/gateway.env" \
  --dry-run
```

Expected drill-suite artifact:
- `evidence/h2-drill-suite-*.json`

### Horizon H3 - Runtime Durability and Policy Maturity

Goal: harden memory, capability policy, and audit controls for long-run production load.

Workstreams:
- Introduce transaction-safe unified memory backend option (while preserving file backend compatibility).
- Add policy source model for capability access updates with explicit change audit.
- Enforce retention/rotation policy for dispatch audit logs and command logs.

Exit evidence:
- Memory durability test suite passing under concurrent writes.
- Capability policy change events captured with immutable audit records.
- Log lifecycle policy tested with restore/readability checks.

Primary risks:
- Data consistency regressions during backend transition.
- Policy misconfiguration denying critical operational capabilities.

Mitigations:
- Dual-write/verify migration mode before backend switch.
- Safe default policy profile with explicit emergency override procedure.

### Horizon H4 - Legacy Path Retirement and Contract Tightening

Goal: remove non-unified runtime entry points after sustained parity.

Workstreams:
- Identify and deprecate direct Eve/Hermes invocation paths outside unified dispatch.
- Remove compatibility shims that are no longer required by production integrations.
- Freeze a versioned unified dispatch contract and publish upgrade notes.

Exit evidence:
- Static scan confirms no production ingress path bypasses unified dispatch.
- Deprecation map completed with migration status per legacy path.
- Contract conformance tests run against versioned fixtures.

Primary risks:
- Hidden dependency on legacy path in operator scripts.
- Contract changes breaking downstream consumers.

Mitigations:
- Shadow deprecation checks before removal.
- Backward-compat fixture tests for one release window.

### Horizon H5 - Autonomous Operations and Scale Envelope

Goal: support multi-tenant and multi-region operation with agent-driven remediation loops.

Workstreams:
- Define tenant isolation model for routing, memory, and capability policy scopes.
- Add region-aware failover and replay-safe dispatch behavior.
- Build remediation playbooks that can be executed by cloud agents with bounded policy controls.

Exit evidence:
- Tenant isolation validation suite and cross-tenant leak checks passing.
- Region failover simulation with recovery and consistency verification.
- Agent remediation dry-runs producing auditable action manifests.

Primary risks:
- Isolation boundary violations at config or memory layers.
- Unsafe automation actions under degraded conditions.

Mitigations:
- Tenant-scoped config validation gate before rollout.
- Policy-constrained automation with explicit human escalation gates.

### Horizon H6 - Sustainment and Continuous Assurance

Goal: after full cutover (H5), keep gates reproducible with a minimal recurring assurance bundle that chains metadata validation, tenant isolation, region rehearsal, and unified ingress scans.

Workstreams:
- Extend horizon orchestration (`HORIZON_SEQUENCE` through H6) so promotion and audit tooling accept terminal sustainment horizon.
- Emit machine-readable sustainment evidence (`evidence/h6-assurance-bundle-*.json`) from `npm run run:h6-assurance-bundle`.
- CI runs the bundle alongside existing H5 remediation evidence.

Exit evidence:
- `npm run run:h6-assurance-bundle` passes and artifact matches `evidence/h6-assurance-bundle-*.json`.
- `npm run validate:h6-closeout` passes when evidence is present (H6 is terminal: stage-promotion readiness skipped in closeout validator).

Primary risks:
- Drift between documented horizons and `VALID_HORIZONS` in tooling.

Mitigations:
- Single source: update `docs/HORIZON_STATUS.json` and run `npm run validate:horizon-status`.

### Post-H6 operations

After **H6** is marked completed, use **`npm run verify:sustainment-loop`** (see `docs/MASTER_EXECUTION_CHECKLIST.md` Phase 8) for a single chained verification that refreshes assurance evidence and runs **`validate:h6-closeout`**.

## Cross-Horizon Execution Rules

1. Do not promote any horizon gate without a passing merge bundle and release readiness manifest.
2. Any routing or policy change must include rollback drill evidence.
3. Every horizon change set must update `docs/CLOUD_AGENT_HANDOFF.md` with new operational expectations.
4. If a horizon introduces a new critical artifact, add validation script + test before rollout.

## Immediate Next Actions (Current Execution Slice - H2)

1. Run majority promotion drill via `npm run run:stage-drill -- --target-stage majority --dry-run --evidence-dir evidence` and capture report.
2. Calibrate H2 rollback-policy thresholds using canary + majority drill outputs (success rate, trace rate, P95 latency) with:
   - `npm run calibrate:rollback-thresholds -- --stage majority --evidence-dir evidence`
3. Execute supervised rollback auto-apply simulation with calibrated thresholds in a controlled environment:
   - `npm run run:supervised-rollback-simulation -- --stage majority --evidence-dir evidence --horizon-status-file docs/HORIZON_STATUS.json --runtime-env-file "$HOME/.openclaw/run/gateway.env" --allow-horizon-mismatch`
4. Run consolidated H2 closeout pipeline (calibration + supervised simulation + closeout gate) in one command:
   - `npm run run:h2-closeout -- --stage majority --evidence-dir evidence --horizon-status-file docs/HORIZON_STATUS.json --runtime-env-file "$HOME/.openclaw/run/gateway.env" --allow-horizon-mismatch`
5. Capture promotion/rollback decision traces as required evidence for H2 closeout criteria draft from:
   - `evidence/rollback-threshold-calibration-*.json`
   - `evidence/supervised-rollback-simulation-*.json`
   - `evidence/h2-closeout-run-*.json`
6. Enforce H2 closeout evidence via executable gate:
   - `npm run validate:h2-closeout -- --evidence-dir evidence --horizon-status-file docs/HORIZON_STATUS.json`
7. Promote H2 with a single command that runs closeout and applies horizon advancement in one flow:
   - `npm run run:h2-promotion -- --stage majority --evidence-dir evidence --horizon-status-file docs/HORIZON_STATUS.json --runtime-env-file "$HOME/.openclaw/run/gateway.env" --allow-horizon-mismatch`
8. Enforce longer-goal progression at promotion time so each horizon carries a larger action runway than the previous:
   - `npm run run:h2-promotion -- --stage majority --evidence-dir evidence --horizon-status-file docs/HORIZON_STATUS.json --require-progressive-goals --minimum-goal-increase 1`
   - optionally bind to a policy profile in `docs/HORIZON_STATUS.json.goalPolicies.transitions` using:
     - `--goal-policy-key H2->H3`
   - optionally enable strict one-flag policy gating for the immediate transition:
     - `--strict-goal-policy-gates`
     - this enables progressive-goals + coverage + readiness-audit gates and requires tagged targets + positive pending minimums
  - optionally source transition policies from a dedicated policy manifest:
    - `--goal-policy-file docs/GOAL_POLICIES.json`
    - when omitted, promotion checks auto-discover `GOAL_POLICIES.json` adjacent to the selected `--horizon-status-file` when present
  - optionally require policy coverage from current to future horizons:
    - `--require-goal-policy-coverage --goal-policy-coverage-until-horizon H6 --required-policy-transitions H2->H3,H3->H4,H4->H5,H5->H6 --require-policy-tagged-targets`
  - optionally require a passing policy readiness audit gate during promotion:
    - `--require-goal-policy-readiness-audit --goal-policy-readiness-audit-max-target-horizon H6 --require-goal-policy-readiness-tagged-targets --require-goal-policy-readiness-positive-pending-min`
   - this can enforce action composition targets (for example, minimum counts of `durability`, `policy`, or `capability` tagged next-horizon actions)
9. Optionally run direct horizon promotion with a pinned closeout artifact when replaying prior evidence:
   - `npm run promote:horizon -- --horizon H2 --next-horizon H3 --horizon-status-file docs/HORIZON_STATUS.json --goal-policy-file docs/GOAL_POLICIES.json --closeout-run-file evidence/h2-closeout-run-*.json --require-progressive-goals --minimum-goal-increase 1 --goal-policy-key H2->H3 --require-goal-policy-coverage --goal-policy-coverage-until-horizon H6 --required-policy-transitions H2->H3,H3->H4,H4->H5,H5->H6 --require-policy-tagged-targets`
10. Generate a machine-readable multi-horizon policy readiness audit before promotion:
   - `npm run audit:goal-policy-readiness -- --source-horizon H2 --max-target-horizon H6 --horizon-status-file docs/HORIZON_STATUS.json`
   - optional explicit source pinning: `--goal-policy-file docs/GOAL_POLICIES.json`
11. Validate dedicated goal-policy manifests as a standalone gate before promotion:
   - `npm run validate:goal-policy-file -- --horizon-status-file docs/HORIZON_STATUS.json`
   - optional explicit policy source: `--goal-policy-file docs/GOAL_POLICIES.json`
   - optional strict transition window override: `--source-horizon H2 --until-horizon H6 --require-tagged-requirements --require-positive-pending-min`
12. Require promotion to run the goal-policy file gate inline (no separate preflight command needed):
   - `npm run promote:horizon -- --horizon H2 --next-horizon H3 --horizon-status-file docs/HORIZON_STATUS.json --closeout-run-file evidence/h2-closeout-run-*.json --strict-goal-policy-gates --require-goal-policy-file-validation`
   - optional explicit gate output path: `--goal-policy-file-validation-out evidence/goal-policy-file-validation-H2-to-H3.json`

## Horizon Closeout Gate

Before promoting a horizon from `in_progress` to `completed`, run:

```bash
npm run validate:horizon-closeout -- --horizon H1
```

Expected for passing closeout:
- exit code `0`
- output manifest `evidence/horizon-closeout-H1-*.json`
- payload includes:
  - `"pass": true`
  - `"checks.horizonStateCompleted": true`
  - `"checks.nextHorizonPlannedOrInProgress": true`

