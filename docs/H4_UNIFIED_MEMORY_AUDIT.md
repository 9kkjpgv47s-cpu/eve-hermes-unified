# H4 unified memory audit (cross-lane + WAL)

This document supports **h4-action-6** (memory surface audit for legacy retirement).

## Storage model

- **File backend:** `FileUnifiedMemoryStore` persists a JSON snapshot plus an optional **append-only WAL** (`UNIFIED_MEMORY_JOURNAL_PATH`).
- **Lane isolation:** Keys are namespaced by **`lane`** (`eve` | `hermes`) and **`namespace`** / **`key`** (see `createMemoryStorageKey` in `src/memory/unified-memory-store.ts`).

## Invariants operators should rely on

1. **Cross-lane independence** — Eve and Hermes keys under the same logical namespace string remain distinct storage keys because the lane is part of the storage key materialization.
2. **Crash recovery** — After a simulated process restart, **snapshot + WAL replay** must reproduce the same logical map as an in-process store that flushed the same operations (see `npm run validate:memory-durability` and `src/bin/verify-memory-durability.ts`).
3. **H4 audit probe** — `src/bin/memory-audit-report.ts` writes paired Eve/Hermes values, re-opens the store, and verifies **`buildMemoryMapFromSnapshotAndJournal`** matches both lanes. It emits JSON with **`checks.crossLaneInvariantPass`** and **`checks.walReplayInvariantPass`**.

## Evidence

- **Bundle:** `npm run bundle:h4-closeout-evidence` (or `npm run verify:h4-closeout-evidence`) writes **`evidence/h4-closeout-evidence-*.json`** including the embedded memory audit report and dispatch fixture test results.
- **Schema:** `node scripts/validate-manifest-schema.mjs --type h4-closeout-evidence --file <path>`.

## Retirement guidance

Treat **unified memory** accessed only through **`dispatchUnifiedMessage`** + **`TenantScopedMemoryStore`** (when isolation is on) as the supported contract. Direct file edits to snapshot or journal outside the store APIs are out of scope for H4 and void machine-checkable guarantees.
