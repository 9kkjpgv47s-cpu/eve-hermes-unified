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

## Cross-Horizon Execution Rules

1. Do not promote any horizon gate without a passing merge bundle and release readiness manifest.
2. Any routing or policy change must include rollback drill evidence.
3. Every horizon change set must update `docs/CLOUD_AGENT_HANDOFF.md` with new operational expectations.
4. If a horizon introduces a new critical artifact, add validation script + test before rollout.

## Immediate Next Actions (First Execution Slice)

1. Add CI workflow that executes the full validation chain and publishes merge bundle artifacts.
2. Add schema validation test for `release-readiness` and merge-bundle manifests.
3. Add operator retrieval/verification steps to production runbook.
4. Add horizon tracking section to handoff document so incoming agents know active gate and blockers.

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

