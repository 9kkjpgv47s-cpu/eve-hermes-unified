# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- Active horizon: `H2` (`docs/HORIZON_STATUS.json`); H3 durability advances in code ahead of promotion.
- Branch: **`cursor/h3-memory-atomic-closeout-taxonomy-cc15`** — atomic file memory + optional **WAL journal** + closeout validator **h2_* compat aliases** for horizon closeout/promotion run checks.

## What Was Just Completed (large chunk)

### H3

1. **File memory WAL** — `UNIFIED_MEMORY_JOURNAL_PATH`: append-only journal, replay after snapshot load, truncate after successful persist (`src/memory/unified-memory-store.ts`).
2. **Atomic snapshot persist** — write temp + `rename` (existing).
3. **Preflight** — journal path writable when file store + journal set (`src/runtime/preflight.ts`).
4. **Capability execution timeout** — `UNIFIED_CAPABILITY_EXECUTION_TIMEOUT_MS` (existing on branch).

### Tooling

1. **`validate-horizon-closeout.mjs`** — drill suite already dual-reports `horizon_drill_*` / `h2_drill_*`; **horizon-closeout-run** and **horizon-promotion-run** now append **`h2_closeout_run_*`** / **`h2_promotion_run_*`** aliases for each `horizon_*` failure id (pass logic unchanged).

## Read Order (Zero-Context Startup)

1. `README.md`
2. `AGENTS.md`
3. `AGENT.md`
4. `docs/CLOUD_AGENT_HANDOFF.md` (H3 memory journal section)
5. `docs/NEXT_LONG_HORIZON_ACTION_PLAN.md`
6. `docs/HORIZON_STATUS.json`

## Immediate Next High-Output Targets

1. **Persist verify** / **journal replay verify** (post-snapshot hash or snapshot+WAL equivalence) if operators need stronger fail-fast gates.
2. **Dispatch audit** schema versioning + manifest validation if consumers need strict JSONL contracts.
3. Keep `npm run check && npm test && npm run validate:all` green before merge.

## Validation Pack

```bash
npm run check
npm test
npm run validate:all
```

## Guardrails

- WAL is truncated only after a successful snapshot persist; crash between append and persist can leave redundant journal lines — replay is idempotent for `set`/`delete`.

## Delivery Checklist Per Iteration

- Implement + tests + docs for operator-visible behavior.
- Commit, push, open/update PR.
