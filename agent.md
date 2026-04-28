# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- Active horizon: `H2` (`docs/HORIZON_STATUS.json`); H3 durability items **h3-action-1** and **h3-action-4** are **completed** in status.
- Branch: **`cursor/h3-dispatch-queue-memory-durability-cc15`** — dispatch **queue journal** + **memory durability** verify + manifest / reconcile tooling.

## What Was Just Completed (large chunk)

### H3

1. **Dispatch queue journal** — optional **`UNIFIED_DISPATCH_QUEUE_JOURNAL_PATH`**; append **`dispatch_queue_accepted`** / **`dispatch_queue_finished`** per dispatch (shared `traceId`); rotation env vars; **`reconcile:dispatch-queue`** script; **`validate-manifest-schema --type dispatch-queue-journal-jsonl`**; evidence glob **`dispatch-queue-journal-*.jsonl`**.
2. **Memory durability verify** — **`npm run validate:memory-durability`** (`src/bin/verify-memory-durability.ts`): WAL + snapshot, eve/hermes keys, simulated restart, **`verifyPersist`** + **`verifyJournalReplay`** on each cycle.

### Prior (carry-forward on branch)

- Router telemetry JSONL, progressive goals script semantics, router no-fallback policy, etc. (see `docs/CLOUD_AGENT_HANDOFF.md`).

## Read Order (Zero-Context Startup)

1. `README.md`
2. `AGENTS.md`
3. `AGENT.md`
4. `docs/CLOUD_AGENT_HANDOFF.md` (H3 memory + dispatch audit sections)
5. `docs/NEXT_LONG_HORIZON_ACTION_PLAN.md`
6. `docs/HORIZON_STATUS.json`

## Immediate Next High-Output Targets

1. **`h3-action-3`** — capability execution safety / resource budgets beyond current timeout (see `docs/HORIZON_STATUS.json`).
2. **`h3-action-5`** / **`h3-action-6`** — long-window soak SLO drift + emergency rollback rehearsal bundles.
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
