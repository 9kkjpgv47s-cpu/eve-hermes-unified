# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- Active horizon: `H2` (`docs/HORIZON_STATUS.json`); H3 durability advances in code ahead of promotion.
- Branch: **`cursor/h3-router-telemetry-jsonl-cc15`** — optional **router telemetry JSONL** for no-fallback policy events + manifest validation.

## What Was Just Completed (large chunk)

### H3 / H4

1. **Capability policy audit JSONL** — denials + optional startup fingerprint; **`validate-manifest-schema`** gate **`capability-policy-audit-jsonl`**.
2. **Policy audit rotation** — **`UNIFIED_CAPABILITY_POLICY_AUDIT_ROTATION_*`**; shared **`maybeRotateJsonlLogInPlace`** with dispatch audit.
3. **Router fallback hardening** — **`UNIFIED_ROUTER_NO_FALLBACK_ON_PRIMARY_FAILURE_CLASSES`** skips fallback lane on selected primary **`failureClass`** when **`failClosed=0`**; **`fallbackInfo`** carries **`primaryFailureClass`** + **`noFallbackOnPrimaryFailureClasses`** into dispatch audit JSONL.
4. **Failure id inventory** — documented dual-report coverage in **`docs/CLOUD_AGENT_HANDOFF.md`** (`validate-horizon-closeout`, `promote-horizon`, `run-h2-closeout`, `run-h2-promotion`).
5. **Router telemetry JSONL** — optional **`UNIFIED_ROUTER_TELEMETRY_LOG_PATH`** appends **`router_no_fallback_skipped`** events; **`validate-manifest-schema --type router-telemetry-jsonl`**; optional rotation env vars; dispatch calls **`appendRouterTelemetryNoFallbackSkipped`** when path set.
6. **Progressive horizon goals** — **`check-progressive-horizon-goals`** uses pending source rows only; skips growth-vs-source when source has zero pending (compatible with **`docs/GOAL_POLICIES.json`**).
7. **Horizon status** — **`h3-action-2`** marked **`completed`** in **`docs/HORIZON_STATUS.json`**.

## Read Order (Zero-Context Startup)

1. `README.md`
2. `AGENTS.md`
3. `AGENT.md`
4. `docs/CLOUD_AGENT_HANDOFF.md` (H3 memory + dispatch audit sections)
5. `docs/NEXT_LONG_HORIZON_ACTION_PLAN.md`
6. `docs/HORIZON_STATUS.json`

## Immediate Next High-Output Targets

1. **H3 durability queue** — `docs/HORIZON_STATUS.json` **`h3-action-1`** (persistent cross-lane dispatch recovery semantics).
2. **Memory durability verification suite** — **`h3-action-4`** (crash/restart + cross-lane consistency).
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
