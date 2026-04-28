# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- Active horizon: `H2` (`docs/HORIZON_STATUS.json`); H3 durability advances in code ahead of promotion.
- Branch: **`cursor/h3-wal-journal-closeout-compat-cc15`** (extend with new commit) — file memory **WAL**, optional **persist verify** / **journal replay verify**, dispatch audit **`auditSchemaVersion`**, **`validate-manifest-schema`** gate for **`unified-dispatch-audit-jsonl`**, closeout **h2_* compat aliases**.

## What Was Just Completed (large chunk)

### H3

1. **File memory WAL** — `UNIFIED_MEMORY_JOURNAL_PATH` (append/replay/truncate on persist).
2. **Persist verify** — `UNIFIED_MEMORY_VERIFY_PERSIST=1` re-reads snapshot + hash/map compare after each persist.
3. **Journal replay verify** — `UNIFIED_MEMORY_VERIFY_JOURNAL_REPLAY=1` verifies snapshot+WAL vs memory before each persist.
4. **Dispatch audit schema** — `auditSchemaVersion` on each JSONL line (`src/contracts/dispatch-audit-version.ts`).

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

1. **Horizon-neutral failure taxonomy** — `run-h2-closeout.mjs` appends **`h2_closeout_gate_failed`** for any closeout source horizon **H2+** (aligned with `promote-horizon.mjs` closeout-run gate aliases).
2. **Tenant isolation** — `UNIFIED_TENANT_STRICT`, **`UNIFIED_TENANT_ALLOWLIST`**, envelope `tenantId` / `metadata.tenantId`, scoped capability memory via `TenantScopedMemoryStore`; extend to full dispatch memory if product requires it.
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
