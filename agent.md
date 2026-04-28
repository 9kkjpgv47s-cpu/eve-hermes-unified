# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- Active horizon: `H2` (`docs/HORIZON_STATUS.json`); H3 durability advances in code ahead of promotion.
- Branch: **`cursor/h5-tenant-runtime-cc15`** — tenant + policy audit + dispatch audit v2; shared **JSONL rotation** for dispatch and capability policy audit logs.

## What Was Just Completed (large chunk)

### H3 / H4

1. **Capability policy audit JSONL** — denials + optional startup fingerprint; **`validate-manifest-schema`** gate **`capability-policy-audit-jsonl`**.
2. **Policy audit rotation** — **`UNIFIED_CAPABILITY_POLICY_AUDIT_ROTATION_*`**; shared **`maybeRotateJsonlLogInPlace`** with dispatch audit.
3. **Router fallback hardening** — **`UNIFIED_ROUTER_NO_FALLBACK_ON_PRIMARY_FAILURE_CLASSES`** skips fallback lane on selected primary **`failureClass`** when **`failClosed=0`**; **`fallbackInfo`** carries **`primaryFailureClass`** + **`noFallbackOnPrimaryFailureClasses`** into dispatch audit JSONL.
4. **Failure id inventory** — documented dual-report coverage in **`docs/CLOUD_AGENT_HANDOFF.md`** (`validate-horizon-closeout`, `promote-horizon`, `run-h2-closeout`, `run-h2-promotion`).

## Read Order (Zero-Context Startup)

1. `README.md`
2. `AGENTS.md`
3. `AGENT.md`
4. `docs/CLOUD_AGENT_HANDOFF.md` (H3 memory + dispatch audit sections)
5. `docs/NEXT_LONG_HORIZON_ACTION_PLAN.md`
6. `docs/HORIZON_STATUS.json`

## Immediate Next High-Output Targets

1. **Horizon-neutral failure taxonomy** — sweep any new orchestration scripts for H2-only ids; current inventory is in **`docs/CLOUD_AGENT_HANDOFF.md`**.
2. **Router telemetry** — extend with optional dedicated JSONL or metrics sink if operators need cardinality outside dispatch audit.
3. Keep `npm run check && npm test && npm run validate:all` green before merge.

## Validation Pack

```bash
npm run check
npm test
npm run validate:all
```

## Guardrails

- Persist verify and journal replay verify are **fail-fast** when enabled.
- Bump `UNIFIED_DISPATCH_AUDIT_SCHEMA_VERSION` when changing dispatch audit record shape.

## Delivery Checklist Per Iteration

- Implement + tests + docs for operator-visible behavior.
- Commit, push, open/update PR.
