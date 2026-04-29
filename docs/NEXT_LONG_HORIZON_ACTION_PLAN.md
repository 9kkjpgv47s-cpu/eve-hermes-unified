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
- Single source: update `docs/HORIZON_STATUS.json` and run `npm run validate:horizon-status` (validator accepts **H1–H11**).

### Horizon H7 - Dispatch audit lifecycle (rotation and retention)

Goal: close the H3 roadmap gap on dispatch audit **lifecycle** by enforcing bounded on-disk generations for JSONL audit logs without breaking append semantics.

Workstreams:

- Size-triggered rotation of the active dispatch audit log before append (timestamped sibling archives).
- Configurable retention cap on rotated generations with safe defaults (rotation disabled when max-bytes is unset or zero).
- Executable proof via **`npm run run:h7-assurance-bundle`** (extends H6 gates with audit rotation unit tests) and **`validate:h7-closeout`**.

Exit evidence:

- **`npm run run:h7-assurance-bundle`** passes and artifact matches **`evidence/h7-assurance-bundle-*.json`**.
- **`npm run validate:h7-closeout`** passes when evidence is present (H7 is terminal: stage-promotion readiness skipped in closeout validator).

Primary risks:

- Operators surprised by silent rotation when thresholds are set too aggressively.

Mitigations:

- Document defaults (rotation off until **`UNIFIED_DISPATCH_AUDIT_ROTATION_MAX_BYTES`** is set); tune retention with **`UNIFIED_DISPATCH_AUDIT_ROTATION_RETAIN_COUNT`**.

### Horizon H8 - Capability policy authorization audit trail

Goal: deliver immutable **authorization evidence** for `@cap` commands by appending one JSON record per policy evaluation (allow/deny + stable reason code), addressing the H3 roadmap theme of policy-change accountability at the enforcement boundary.

Workstreams:

- Append-only JSONL sink configurable via **`UNIFIED_CAPABILITY_POLICY_AUDIT_LOG_PATH`** (default: sibling of dispatch audit directory).
- Integration in **`UnifiedCapabilityEngine`** immediately after **`authorize()`**; optional **`tenantId`** / **`regionId`** when present on the envelope.
- Preflight writable-parent check for the audit path (aligned with dispatch audit checks).

Exit evidence:

- **`npm run run:h8-assurance-bundle`** passes and artifact matches **`evidence/h8-assurance-bundle-*.json`** (includes **`capabilityPolicyAuditPass`**).
- **`npm run validate:h8-closeout`** passes when evidence is present (H8 is terminal: stage-promotion readiness skipped in closeout validator).

Primary risks:

- Log volume growth on chatty `@cap` workloads.

Mitigations:

- Operators pin **`UNIFIED_CAPABILITY_POLICY_AUDIT_LOG_PATH`** to rotated filesystems or ship logs to centralized retention; dispatch audit rotation remains separate on **`UNIFIED_AUDIT_LOG_PATH`**.

### Horizon H9 - Crash-safe file-backed unified memory snapshots

Goal: advance the H3 durability theme for **unified memory** by ensuring **`UNIFIED_MEMORY_STORE_KIND=file`** commits complete JSON snapshots without torn writes visible to concurrent readers during process crashes.

Workstreams:

- **`FileUnifiedMemoryStore.persist()`** writes **`${path}.tmp`** then **`rename`** to the primary path (same directory).
- Vitest proof in **`test/unified-memory-atomic-persistence.test.ts`** included in **`npm run run:h9-assurance-bundle`**.

Exit evidence:

- **`npm run run:h9-assurance-bundle`** passes and artifact matches **`evidence/h9-assurance-bundle-*.json`** (includes **`memoryAtomicPersistencePass`**).
- **`npm run validate:h9-closeout`** passes when evidence is present (H9 is terminal: stage-promotion readiness skipped in closeout validator).

Primary risks:

- Leftover **`.tmp`** files after hard kills before rename (operators may delete stale `*.tmp` siblings).

Mitigations:

- Temp file lives beside the primary JSON file; next successful persist overwrites behavior remains deterministic.

### Horizon H10 - Dispatch durability queue bounded retention

Goal: close the remaining **durability queue lifecycle** gap from H3 by bounding on-disk growth of **completed** (`dispatched` / `failed`) entries without dropping **`pending`** replay work.

Workstreams:

- Configurable max retained non-terminal entries via **`UNIFIED_DISPATCH_DURABILITY_QUEUE_RETENTION_NON_TERMINAL_MAX`** (alias **`DISPATCH_QUEUE_RETENTION_NON_TERMINAL_MAX`**); **`0`** disables pruning (legacy unbounded behavior).
- After each queue mutation, prune **oldest** dispatched/failed rows first (sort by `enqueuedAtIso`, then `id`).
- Executable proof via **`npm run run:h10-assurance-bundle`** (extends H9 gates with **`test/dispatch-durability-queue-retention.test.ts`**) and **`validate:h10-closeout`**.

Exit evidence:

- **`npm run run:h10-assurance-bundle`** passes and artifact matches **`evidence/h10-assurance-bundle-*.json`** (includes **`dispatchDurabilityQueueRetentionPass`**).
- **`npm run validate:h10-closeout`** passes when evidence is present (H10 is terminal: stage-promotion readiness skipped in closeout validator).

Primary risks:

- Operators set retention too low and lose forensic history for incident review.

Mitigations:

- Sensible default (**5000**); document **`0`** for unlimited retention when disk is not a concern.

### Horizon H11 - Capability policy audit JSONL lifecycle (rotation)

Goal: align **`UNIFIED_CAPABILITY_POLICY_AUDIT_LOG_PATH`** append-only JSONL with the dispatch audit **rotation pattern** so noisy `@cap` workloads cannot grow a single file without bound when operators opt in.

Workstreams:

- **`UNIFIED_CAPABILITY_POLICY_AUDIT_ROTATION_MAX_BYTES`** / **`UNIFIED_CAPABILITY_POLICY_AUDIT_ROTATION_RETAIN_COUNT`** (aliases without **`UNIFIED_`** prefix); **`0`** max-bytes keeps rotation off (H8 default append-only behavior unchanged).
- **`appendCapabilityPolicyAuditLog`** calls **`maybeRotateAppendOnlyJsonlAuditLog`** before append when configured; **`UnifiedCapabilityEngine`** receives rotation via **`unified-dispatch`** runtime wiring.
- Executable proof via **`npm run run:h11-assurance-bundle`** (extends H10 gates with **`test/capability-policy-audit-rotation.test.ts`**) and **`validate:h11-closeout`**.

Exit evidence:

- **`npm run run:h11-assurance-bundle`** passes and artifact matches **`evidence/h11-assurance-bundle-*.json`** (includes **`capabilityPolicyAuditRotationPass`**).
- **`npm run validate:h11-closeout`** passes when evidence is present (stage-promotion readiness skipped when the next horizon is already completed or when validating terminal **H16**).

Primary risks:

- Operators enable aggressive thresholds and rotate away forensic history unexpectedly.

Mitigations:

- Document **`0`** default for max-bytes (rotation disabled until explicitly configured).

### Horizon H12 - Dispatch durability queue replay attempt bound

Goal: prevent indefinite retries for poison messages by capping replay attempts per **`pending`** durability queue row while preserving **`0`** (unlimited) as the default for backward compatibility.

Workstreams:

- **`UNIFIED_DISPATCH_DURABILITY_QUEUE_REPLAY_MAX_ATTEMPTS_PER_ENTRY`** (alias **`DISPATCH_QUEUE_REPLAY_MAX_ATTEMPTS_PER_ENTRY`**); **`0`** disables the cap.
- **`replayPendingDispatches`** marks entries **`failed`** with **`replay_max_attempts_exceeded`** when **`attempts`** reach the cap before another replay dispatch.
- Executable proof via **`npm run run:h12-assurance-bundle`** (extends H11 gates with **`test/dispatch-durability-queue-replay-limit.test.ts`**) and **`validate:h12-closeout`**.

Exit evidence:

- **`npm run run:h12-assurance-bundle`** passes and artifact matches **`evidence/h12-assurance-bundle-*.json`**.
- **`npm run validate:h12-closeout`** passes when evidence is present (stage-promotion readiness skipped when the next horizon is already completed or when validating terminal **H16**).

Primary risks:

- Operators set the cap too low and drop legitimate transient failures into **`failed`** prematurely.

Mitigations:

- Default **`0`** (unbounded retries); document tuning against **`attempts`** telemetry from queue JSON.

### Horizon H13 - CI soak SLO drift gate (reliability observability)

Goal: align **north-star** reliability/latency expectations with **executable CI enforcement** by failing closed when soak simulation output drifts below trace presence, success rate, or P95 latency thresholds (`summarize-soak-report.mjs`).

Workstreams:

- **`scripts/run-ci-soak-slo-gate.mjs`**: run **`soak-simulate.sh`** (iteration count via **`UNIFIED_CI_SOAK_ITERATIONS`**, default **25**), then **`summarize-soak-report.mjs`** with **`UNIFIED_SOAK_FAIL_ON_DRIFT=1`**.
- **`npm run run:h13-assurance-bundle`**: **`run-h12-assurance-bundle`** plus CI soak gate; artifact **`evidence/h13-assurance-bundle-*.json`** includes **`ciSoakSloDriftGatePass`**.
- **`unified-ci`**: runs **`run:h13-assurance-bundle`** early in the validate job so regressions surface before **`validate:all`**.

Exit evidence:

- **`npm run run:h13-assurance-bundle`** passes and artifact matches **`evidence/h13-assurance-bundle-*.json`**.
- **`npm run validate:h13-closeout`** passes when evidence is present (stage-promotion readiness skipped when the next horizon is already completed or when validating terminal **H16**).

Primary risks:

- CI runners are slower than laptop soak runs; P95 threshold default (**60s**) may need tuning via **`UNIFIED_SOAK_MAX_P95_ELAPSED_MS`**.

Mitigations:

- Keep soak iterations modest in CI; document env overrides for noisy hosts.

### Post-H13 operations (sustainment; subsumed by H14 terminal chain)

After **H13** is marked completed, the **H13** assurance evidence remains part of **`npm run run:h14-assurance-bundle`** (and **`npm run run:h15-assurance-bundle`** chains H14). For terminal sustainment, use **Post-H15** below. Legacy: **`verify:sustainment-loop:h13-legacy`** … **`h6-legacy`**.

### Horizon H14 - Shell unified dispatch ingress (operational convergence)

Goal: ensure **all** main shell validation paths that invoke unified-dispatch use a **single resolver** (dist `node` binary when present, else **`tsx src/bin/unified-dispatch.ts`**) so `validate:all` and operator scripts work **without** a prior `npm run build`, matching the north-star on **self-priming** automation.

Workstreams:

- **`scripts/unified-dispatch-runner.sh`**: `resolve_unified_dispatch` → **`UNIFIED_DISPATCH_CMD`**.
- **Refactor** **`soak-simulate.sh`**, **`regression-eve-primary.sh`**, **`verify-cutover-readiness.sh`**, **`failure-injection-smoke.sh`** to source the runner and use **`"${UNIFIED_DISPATCH_CMD[@]}"`**.
- **`scripts/validate-shell-unified-dispatch.sh`**: fast smoke that the resolver works.
- **`npm run run:h14-assurance-bundle`**: H13 sub-bundle + shell gate; artifact includes **`shellUnifiedDispatchScriptsPass`**.

Exit evidence:

- **`npm run run:h14-assurance-bundle`** passes and artifact matches **`evidence/h14-assurance-bundle-*.json`**.
- **`npm run validate:h14-closeout`** passes when evidence is present (**H14** is terminal: stage-promotion readiness skipped in closeout validator).

Primary risks:

- Custom **`UNIFIED_DISPATCH_BIN`** must point at a real file if set.

Mitigations:

- Document behavior in **`docs/CLOUD_AGENT_HANDOFF.md`**; gate exercises default resolution on CI runners.

### Post-H14 operations (sustainment; subsumed by H15 terminal chain)

After **H14** is marked completed, **`npm run run:h14-assurance-bundle`** remains the shell resolver smoke path; terminal sustainment uses **Post-H15** below. Legacy: **`verify:sustainment-loop:h13-legacy`** / **`validate:post-h13-sustainment-manifest`**, **`verify:sustainment-loop:h12-legacy`** … **`h6-legacy`**.

### Horizon H15 - Shell dispatch CI convergence (no bypass of resolver)

Goal: **CI-enforced** guardrail so no **`scripts/*.sh`** (except **`unified-dispatch-runner.sh`**) embeds **`dist/src/bin/unified-dispatch`** substrings or direct **`node`/`tsx`** invocations of **`unified-dispatch`** — operators must use **`resolve_unified_dispatch`** → **`UNIFIED_DISPATCH_CMD`**. Extends the north-star “legacy paths removed after parity” for shell automation.

Workstreams:

- **`scripts/validate-shell-unified-dispatch-ci.mjs`**: line scan with comment stripping for non-runner scripts.
- **`npm run run:h15-assurance-bundle`**: H14 sub-bundle + CI scan; artifact includes **`shellUnifiedDispatchCiScanPass`**.
- **`npm run validate:h15-closeout`**, **`npm run verify:sustainment-loop`** (post-H15), **`npm run validate:post-h15-sustainment-manifest`**.

Exit evidence:

- **`npm run run:h15-assurance-bundle`** passes and artifact matches **`evidence/h15-assurance-bundle-*.json`**.
- **`npm run validate:h15-closeout`** passes when evidence is present (**H15** is terminal: stage-promotion readiness skipped in closeout validator).

Primary risks:

- False positives if a script mentions **`unified-dispatch`** in a comment-free line without invoking it (keep violations rare; prefer resolver wording in docs).

Mitigations:

- Scan skips **`#`** comment lines and blank lines; violations reference file and line number.

### Post-H15 operations (sustainment; subsumed by H16 terminal chain)

After **H15** is marked completed, **`npm run run:h15-assurance-bundle`** remains the shell CI convergence path; terminal sustainment uses **Post-H16** below. Legacy: **`verify:sustainment-loop:h14-legacy`** … **`h6-legacy`**.

### Horizon H16 - Merge readiness policy gates (goal policy + manifest schemas)

Goal: tie **merge-bundle readiness discipline** to executable assurance by chaining **`validate:goal-policy-file`** (full runway **H2→H16**) and **`validate:manifest-schemas`** on **`evidence/`** after the **H15** bundle, so horizon transitions stay aligned with machine-readable evidence shapes before **`validate:all`**.

Workstreams:

- **`npm run run:h16-assurance-bundle`**: **`run-h15-assurance-bundle.mjs`** + **`validate:goal-policy-file`** + **`validate:manifest-schemas`**; artifact includes **`goalPolicyFileValidationPass`** and **`manifestSchemasPass`**.
- **`npm run validate:h16-closeout`**, **`npm run verify:sustainment-loop`** (post-H16), **`npm run validate:post-h16-sustainment-manifest`**.

Exit evidence:

- **`npm run run:h16-assurance-bundle`** passes and artifact matches **`evidence/h16-assurance-bundle-*.json`**.
- **`npm run validate:h16-closeout`** passes when evidence is present (**H16** is terminal: stage-promotion readiness skipped in closeout validator).

Primary risks:

- **`validate:manifest-schemas`** requires existing JSON under **`evidence/`**; CI creates **`evidence/`** and earlier steps populate manifests.

Mitigations:

- Run **H16** bundle after **H6**/tenant gates so baseline evidence exists.

### Post-H16 operations (terminal sustainment)

After **H16** is marked completed, use **`npm run verify:sustainment-loop`** (see `docs/MASTER_EXECUTION_CHECKLIST.md` Phase 8). Optionally **`npm run validate:post-h16-sustainment-manifest`**. Legacy prior chains: **`verify:sustainment-loop:h15-legacy`** / **`validate:post-h15-sustainment-manifest`**, **`verify:sustainment-loop:h14-legacy`** … **`h6-legacy`**.

## Cross-Horizon Execution Rules

1. Do not promote any horizon gate without a passing merge bundle and release readiness manifest.
2. Any routing or policy change must include rollback drill evidence.
3. Every horizon change set must update `docs/CLOUD_AGENT_HANDOFF.md` with new operational expectations.
4. If a horizon introduces a new critical artifact, add validation script + test before rollout.

## Immediate Next Actions (archived H2 drill checklist)

The roadmap horizons **H1–H16** are completed in `docs/HORIZON_STATUS.json`. For ongoing verification, use **`npm run verify:sustainment-loop`** and **`npm run validate:post-h16-sustainment-manifest`** (Phase 8 in `docs/MASTER_EXECUTION_CHECKLIST.md`). The steps below remain as a reference for **H2** stage-drill and promotion workflows.

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

