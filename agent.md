# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- Active horizon: `H2` (`docs/HORIZON_STATUS.json`); H3/H4 workstreams advance in code ahead of horizon promotion.
- Branch: **`cursor/h5-tenant-isolation-cc15`** — H5 tenant gate + scoped capability memory + lane `UNIFIED_TENANT_ID`; **lane abort** (`AbortSignal` / optional capability-budget SIGTERM) + **horizon-neutral** drill failure aliases in closeout validator.

## What Was Just Completed (large chunk)

### H3

1. **File memory WAL** — `UNIFIED_MEMORY_JOURNAL_PATH` (append/replay/clear with persist).
2. **Persist verify** — `UNIFIED_MEMORY_VERIFY_PERSIST=1` re-reads snapshot + hash/map compare after each persist.
3. **Dispatch audit** — rotation + backup prune; each line includes **`auditSchemaVersion`** (`src/contracts/dispatch-audit-version.ts`).
4. **Capability policy audit** — denials + **config snapshots** when stable policy fingerprint changes (`stableCapabilityPolicyJson` + SHA-256); startup append in CLI when audit path set.
5. **Capability execution timeout** — env-driven `Promise.race`; optional **`UNIFIED_CAPABILITY_ABORT_LANE_ON_TIMEOUT`** sends SIGTERM to in-flight **lane** subprocess started via `dispatchLane` when budget elapses.
6. **Preflight** — journal + policy audit path writable checks.
7. **Vitest `globalSetup`** — `./evidence` for script tests.
8. **Journal replay verify** — `UNIFIED_MEMORY_VERIFY_JOURNAL_REPLAY=1` with journal: before each persist, verify on-disk snapshot + WAL replay matches in-memory map.

### H4

1. **`docs/LEGACY_PATH_RETIREMENT_MAP.md`** — canonical entry vs discouraged paths.
2. **`test/unified-dispatch-entrypoint-guard.test.ts`** — fails if `new EveAdapter` / `new HermesAdapter` appear outside `src/bin/unified-dispatch.ts`.

### H5 (slice)

1. **Tenant gate** — `UNIFIED_TENANT_ALLOWLIST`, `UNIFIED_TENANT_STRICT`; optional `UnifiedMessageEnvelope.tenantId` / `metadata.tenantId`; CLI `--tenant-id`.
2. **Memory isolation** — `TenantScopedMemoryStore` for capability-engine reads/writes when tenant present.
3. **Lane subprocess** — `UNIFIED_TENANT_ID` in Eve/Hermes adapter env when envelope carries tenant.
4. **Lane cooperative cancel** — `LaneDispatchInput.signal` / `runCommandWithTimeout` abort; `UnifiedRuntime.abortSignal` for primary/fallback dispatch.

### Tooling

1. **`validate-horizon-closeout.mjs`** — for `h2-drill-suite` verification failures, appends **`horizon_drill_*`** aliases alongside legacy **`h2_drill_*`** ids; for **horizon-closeout-run** and **horizon-promotion-run**, appends legacy **`h2_closeout_run_*`** / **`h2_promotion_run_*`** aliases from **`horizon_*`** failure ids.
2. **`validate-manifest-schema.mjs`** — **`unified-dispatch-audit-jsonl`** type + `evidence/unified-dispatch-audit-*.jsonl` inclusion in **`--type all`** sweep (shape gate for `auditSchemaVersion` and nested routing/state/response).

## Read Order (Zero-Context Startup)

1. `README.md`
2. `AGENTS.md`
3. `AGENT.md`
4. `docs/CLOUD_AGENT_HANDOFF.md` (H3 + **H4 legacy path** + **H5 tenant** sections)
5. `docs/LEGACY_PATH_RETIREMENT_MAP.md`
6. `docs/NEXT_LONG_HORIZON_ACTION_PLAN.md`
7. `docs/HORIZON_STATUS.json`

## Immediate Next High-Output Targets

1. **Horizon-neutral** taxonomy: extend dual-report aliases to other scripts that still filter **`h2_*`** only (e.g. promotion/closeout runners if needed).
2. **Tenant-scoped** non-capability memory (optional) if product requires full store isolation per tenant.
3. Keep `npm run check && npm test && npm run validate:all` green before merge.

## Validation Pack

```bash
npm run check
npm test
npm run validate:all
```

## Guardrails

- Policy snapshot append is **best-effort** on startup; failures should not block dispatch (today: awaited; consider swallow if needed).
- Persist verify throws on mismatch — intentional fail-fast for operators who enable it.
- Journal replay verify throws on mismatch — intentional fail-fast when snapshot+WAL diverges from memory (detects WAL corruption or external journal edits).

## Delivery Checklist Per Iteration

- Implement + tests + docs for operator-visible behavior.
- Commit, push, open/update PR.
