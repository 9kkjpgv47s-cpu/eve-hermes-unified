# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- Active horizon: `H2` (`docs/HORIZON_STATUS.json`); H3 durability advances in code ahead of promotion.
- Branch: **`cursor/h5-tenant-runtime-cc15`** (extend with new commit) — tenant gates, **`UNIFIED_TENANT_MEMORY_ISOLATION`**, capability envelope→lane propagation, adapter tenant env vars.

## What Was Just Completed (large chunk)

### H3

1. **File memory WAL** — `UNIFIED_MEMORY_JOURNAL_PATH` (append/replay/truncate on persist).
2. **Persist verify** — `UNIFIED_MEMORY_VERIFY_PERSIST=1` re-reads snapshot + hash/map compare after each persist.
3. **Journal replay verify** — `UNIFIED_MEMORY_VERIFY_JOURNAL_REPLAY=1` verifies snapshot+WAL vs memory before each persist.
4. **Dispatch audit schema** — `auditSchemaVersion` **v2** on each JSONL line (`tenantId` null or normalized string; `src/contracts/dispatch-audit-version.ts`).

### Tooling

1. **`validate-horizon-closeout.mjs`** — drill `horizon_drill_*` / `h2_drill_*`; **h2_closeout_run_*** / **h2_promotion_run_*** aliases for horizon closeout/promotion run checks.
2. **`validate-manifest-schema.mjs`** — `--type unified-dispatch-audit-jsonl`; `evidence/unified-dispatch-audit-*.jsonl` in `--type all` sweep.

## Read Order (Zero-Context Startup)

1. `README.md`
2. `AGENTS.md`
3. `AGENT.md`
4. `docs/CLOUD_AGENT_HANDOFF.md` (H3 memory + dispatch audit sections)
5. `docs/NEXT_LONG_HORIZON_ACTION_PLAN.md`
6. `docs/HORIZON_STATUS.json`

## Immediate Next High-Output Targets

1. **Horizon-neutral failure taxonomy** — extend dual-report aliases in any remaining scripts that still emit H2-only ids only for `sourceHorizon === "H2"` (inventory + align with `promote-horizon` / `run-h2-closeout` patterns).
2. **Policy / capability audit trail** — immutable append-only log for capability policy denials and config fingerprint changes (H3 action runway).
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
