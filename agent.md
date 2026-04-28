# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- Active horizon: `H2` (`docs/HORIZON_STATUS.json`); **all listed H3 `nextActions` are completed in-repo** (see `docs/HORIZON_STATUS.json`); next program slice is **H4** (legacy path retirement / contract tightening).
- Branch (at handoff time): `cursor/h3-dispatch-wal-soak-rehearsal-7d5a`
- Latest slice (this session):
  - **H3 `h3-action-1`:** Durable dispatch WAL (`UNIFIED_DISPATCH_DURABLE_WAL_PATH`) with `dispatch_attempt` / `dispatch_complete` lines; **`npm run replay:dispatch-wal`** replays orphans and writes `dispatch_replay_complete`; shared **`buildUnifiedDispatchRuntime`**
  - **H3 `h3-action-5`:** **`npm run summarize:soak`** → `scripts/summarize-soak-jsonl.mjs` (failure-class + trace drift alarms on soak JSONL)
  - **H3 `h3-action-6`:** **`npm run run:emergency-rollback-rehearsal`** → `scripts/emergency-rollback-rehearsal.sh` (operator manifest; does not run prod rollback)

## What Was Just Completed

1. Dispatch durable WAL + replay tooling and tests (`dispatch-durable-wal`, preflight WAL path).
2. Soak summarizer + emergency rollback rehearsal script + `package.json` scripts.
3. Horizon tracking: `h3-action-1`, `h3-action-5`, `h3-action-6` → completed; `horizonStates.H3` summary updated; history entries preserved/extended.

## Earlier H3 increments (same convergence line)

- Memory atomic/dual-write; failure-class fallback gate; capability timeout; closeout/promotion taxonomy fixes (see git history / `docs/HORIZON_STATUS.json`).

## Read Order (Zero-Context Startup)

1. `README.md`
2. `AGENTS.md`
3. `AGENT.md`
4. `docs/CLOUD_AGENT_HANDOFF.md`
5. `docs/NEXT_LONG_HORIZON_ACTION_PLAN.md`
6. `docs/HORIZON_STATUS.json`

## Immediate Next High-Output Targets

1. **H4:** legacy path retirement scan + deprecation map (`docs/NEXT_LONG_HORIZON_ACTION_PLAN.md` H4 section).
2. **H2 closeout (when ready):** operator evidence under `evidence/` + `validate:h2-closeout` / promotion flows.
3. Optional: wire `summarize:soak` into CI after long soak runs; tune drift thresholds via env if needed.

## Validation Pack

```bash
npm run check
npm test
npm run validate:all
```

H3 tooling smoke:

```bash
npm run summarize:soak -- --input path/to/soak.jsonl
npm run replay:dispatch-wal -- --dry-run
npm run run:emergency-rollback-rehearsal
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
