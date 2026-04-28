# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- Active horizon: `H2` (`docs/HORIZON_STATUS.json`); H3 actions remain `planned` until promotion closes H2.
- Work branch: `cursor/h3-memory-atomic-closeout-taxonomy-cc15` (or latest `cursor/*` per PR).
- Recent increment:
  - `FileUnifiedMemoryStore` persists via write-to-temp + `rename` (atomic replace on POSIX).
  - `validate-horizon-closeout.mjs` emits **both** `horizon_drill_*` and legacy `h2_drill_*` failure IDs for drill-suite evidence.
  - Vitest `globalSetup` creates `./evidence` so script integration tests do not depend on a pre-existing gitignored folder.
  - Optional **dispatch audit log rotation**: `UNIFIED_AUDIT_LOG_ROTATION_MAX_BYTES` / `UNIFIED_AUDIT_LOG_ROTATION_RETAIN_BYTES` (0 = disabled); rotates to `<path>.1` before append.

## What Was Just Completed

1. Atomic file persistence for unified memory (`src/memory/unified-memory-store.ts`).
2. Horizon-neutral drill-suite closeout checks with legacy `h2_*` aliases preserved.
3. Concurrent file-backed memory regression test; Vitest global setup for `evidence/`.

## Read Order (Zero-Context Startup)

1. `README.md`
2. `AGENTS.md`
3. `AGENT.md`
4. `docs/CLOUD_AGENT_HANDOFF.md`
5. `docs/NEXT_LONG_HORIZON_ACTION_PLAN.md`
6. `docs/HORIZON_STATUS.json`

## Immediate Next High-Output Targets

1. Run real H2 closeout + promotion dry-runs with repo `evidence/` populated from `validate:all`, then `validate:h2-closeout` / `promote:horizon` as documented in `README.md` (advances `HORIZON_STATUS.json` only when intentional).
2. H3 runtime: extend memory layer (optional WAL / journal) and wire capability execution budgets into `capability-engine.ts` per `docs/NEXT_LONG_HORIZON_ACTION_PLAN.md` H3 workstreams.
3. Continue de-H2-prefixing orchestrator **outputs** where gates already accept aliases; keep dual IDs until all consumers migrate.
4. Keep full gate chain green: `npm run check && npm test && npm run validate:all`.

## Validation Pack

```bash
npm run check
npm test
npm run validate:all
```

Targeted suites when touching promotion/closeout paths:

```bash
npm test -- test/h2-closeout-runner-script.test.ts test/promote-horizon-script.test.ts test/h2-promotion-runner-script.test.ts test/horizon-closeout-validation.test.ts
```

## Execution Guardrails

- Never weaken rollback or fail-closed logic.
- Keep deterministic artifact/evidence selection.
- Keep outputs machine-readable JSON with explicit pass/fail signals.
- Any policy/routing behavior change must include tests + evidence updates.

## Delivery Checklist Per Iteration

- Implement meaningful increment (not docs-only unless requested).
- Add/adjust tests.
- Run validation commands.
- Update handoff docs (`agent.md` / `AGENT.md` / `docs/CLOUD_AGENT_HANDOFF.md`) as needed.
- Commit, push, and update PR.
