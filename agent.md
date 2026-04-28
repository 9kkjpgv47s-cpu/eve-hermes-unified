# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- Active horizon: `H2` (`docs/HORIZON_STATUS.json`); H3/H4 workstreams advance in code ahead of horizon promotion.
- Branch: **`cursor/h5-tenant-isolation-cc15`** — H5-style optional tenant gate + scoped capability memory + lane `UNIFIED_TENANT_ID` env (on top of H3/H4 durability and legacy-path guard).

## What Was Just Completed (large chunk)

### H3

1. **File memory WAL** — `UNIFIED_MEMORY_JOURNAL_PATH` (append/replay/clear with persist).
2. **Persist verify** — `UNIFIED_MEMORY_VERIFY_PERSIST=1` re-reads snapshot + hash/map compare after each persist.
3. **Dispatch audit** — rotation + backup prune; each line includes **`auditSchemaVersion`** (`src/contracts/dispatch-audit-version.ts`).
4. **Capability policy audit** — denials + **config snapshots** when stable policy fingerprint changes (`stableCapabilityPolicyJson` + SHA-256); startup append in CLI when audit path set.
5. **Capability execution timeout** — env-driven `Promise.race` (documented subprocess limitation).
6. **Preflight** — journal + policy audit path writable checks.
7. **Vitest `globalSetup`** — `./evidence` for script tests.

### H4

1. **`docs/LEGACY_PATH_RETIREMENT_MAP.md`** — canonical entry vs discouraged paths.
2. **`test/unified-dispatch-entrypoint-guard.test.ts`** — fails if `new EveAdapter` / `new HermesAdapter` appear outside `src/bin/unified-dispatch.ts`.

### H5 (slice)

1. **Tenant gate** — `UNIFIED_TENANT_ALLOWLIST`, `UNIFIED_TENANT_STRICT`; optional `UnifiedMessageEnvelope.tenantId` / `metadata.tenantId`; CLI `--tenant-id`.
2. **Memory isolation** — `TenantScopedMemoryStore` for capability-engine reads/writes when tenant present.
3. **Lane subprocess** — `UNIFIED_TENANT_ID` in Eve/Hermes adapter env when envelope carries tenant.

## Read Order (Zero-Context Startup)

1. `README.md`
2. `AGENTS.md`
3. `AGENT.md`
4. `docs/CLOUD_AGENT_HANDOFF.md` (H3 + **H4 legacy path** + **H5 tenant** sections)
5. `docs/LEGACY_PATH_RETIREMENT_MAP.md`
6. `docs/NEXT_LONG_HORIZON_ACTION_PLAN.md`
7. `docs/HORIZON_STATUS.json`

## Immediate Next High-Output Targets

1. **Lane subprocess cancellation** or explicit lane-level timeouts aligned with capability budget (tenant env is wired; cancellation still open).
2. **Horizon-neutral** closeout taxonomy cleanup (remaining `h2_*` IDs where safe).
3. **Schema gate** for new audit line fields in `validate-manifest-schema` if manifests consume dispatch audit JSONL.
4. Keep `npm run check && npm test && npm run validate:all` green before merge.

## Validation Pack

```bash
npm run check
npm test
npm run validate:all
```

## Guardrails

- Policy snapshot append is **best-effort** on startup; failures should not block dispatch (today: awaited; consider swallow if needed).
- Persist verify throws on mismatch — intentional fail-fast for operators who enable it.

## Delivery Checklist Per Iteration

- Implement + tests + docs for operator-visible behavior.
- Commit, push, open/update PR.
