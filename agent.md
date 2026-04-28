# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- Active horizon: `H2` (`docs/HORIZON_STATUS.json`)
- Branch (at handoff time): `cursor/h3-unified-memory-durability-7d5a`
- Latest slice (this session):
  - **H3 `h3-action-4` (memory durability):** `FileUnifiedMemoryStore` persists with atomic temp+rename JSON writes; optional `UNIFIED_MEMORY_DUAL_WRITE_FILE_PATH` dual-writes to a second file-backed store; preflight validates shadow path; Vitest suite `test/unified-memory-durability.test.ts` covers concurrent writes, restart replay, dual-write, and preflight rules
  - Prior closeout/promotion horizon-neutral work remains on branch history from parent workstreams

## What Was Just Completed

1. **Unified memory file durability (H3 `h3-action-4`):** Atomic write path for JSON persistence; optional dual-write shadow file; runtime config + preflight wiring; Vitest coverage in `test/unified-memory-durability.test.ts`.
2. **Horizon tracking:** `docs/HORIZON_STATUS.json` marks `h3-action-4` completed and records history entry.

## Earlier session (closeout / promotion taxonomy, parent branch)

- Horizon-neutral drill closeout checks, `promote-horizon` / `run-h2-promotion` gate signal alignment, scoped non-H2 closeout gate failure codes, `missing_evidence_dir` fix when `--closeout-run-file` is used.

## Read Order (Zero-Context Startup)

1. `README.md`
2. `AGENTS.md`
3. `AGENT.md`
4. `docs/CLOUD_AGENT_HANDOFF.md`
5. `docs/NEXT_LONG_HORIZON_ACTION_PLAN.md`
6. `docs/HORIZON_STATUS.json`

## Immediate Next High-Output Targets

1. **H3 `h3-action-1`:** persistent queue / replay semantics for cross-lane dispatch recovery (design + incremental implementation + tests).
2. **H3 `h3-action-2`:** stricter policy-router failure-class mappings and deterministic fallback contracts.
3. Complete horizon-neutral taxonomy for remaining H2-only orchestrator strings (keep compatibility aliases).
4. Keep manifest schema gates aligned when adding new evidence types.

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

Targeted suite for unified memory / durability:

```bash
npm test -- test/unified-memory-durability.test.ts test/memory-and-skills-contracts.test.ts
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
