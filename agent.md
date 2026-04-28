# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- Active horizon: `H2` (`docs/HORIZON_STATUS.json`); **first H4 slice landed** (see `h4-action-1`–`h4-action-3` in horizon status).
- Branch (at handoff time): `cursor/h4-dispatch-contract-legacy-scan-7d5a`
- Latest slice:
  - **Versioned dispatch contract:** `UnifiedDispatchResult.contractVersion` + `contractSchemaRef` stamped on every `dispatchUnifiedMessage` result (`src/contracts/dispatch-contract.ts`).
  - **Static ingress gate:** `npm run scan:legacy-dispatch-entrypoints` (wired into `npm run validate:all`).
  - **Docs + fixture:** `docs/H4_UNIFIED_DISPATCH_CONTRACT.md`, `test/fixtures/unified-dispatch-v1-pass.json`, `test/dispatch-contract-fixtures.test.ts`.
  - **Audit log:** JSONL records now include `contractVersion` / `contractSchemaRef` when present.

## Read Order (Zero-Context Startup)

1. `README.md`
2. `AGENTS.md`
3. `AGENT.md`
4. `docs/CLOUD_AGENT_HANDOFF.md`
5. `docs/H4_UNIFIED_DISPATCH_CONTRACT.md`
6. `docs/NEXT_LONG_HORIZON_ACTION_PLAN.md`
7. `docs/HORIZON_STATUS.json`

## Immediate Next High-Output Targets

1. **H4 continuation:** expand deprecation map to scripts/docs that still document direct `eve-task-dispatch` / Hermes shell paths; add optional stricter CI (e.g. scan `scripts/` for forbidden patterns with allowlist).
2. **H2 closeout (when ready):** operator evidence + `validate:h2-closeout` / promotion flows.
3. **Horizon-neutral closeout taxonomy** (remaining H2-prefixed labels outside drill suite, if any).

## Validation Pack

```bash
npm run check
npm test
npm run scan:legacy-dispatch-entrypoints
npm run validate:all
```

Dispatch contract fixture:

```bash
npm test -- test/dispatch-contract-fixtures.test.ts
```

## Execution Guardrails

- Never weaken rollback or fail-closed logic.
- Keep deterministic artifact/evidence selection.
- Keep outputs machine-readable JSON with explicit pass/fail signals.
- Bump `UNIFIED_DISPATCH_CONTRACT_VERSION` when changing dispatch result invariants.

## Delivery Checklist Per Iteration

- Implement meaningful increment (not docs-only unless requested).
- Add/adjust tests.
- Run validation commands.
- Update handoff docs (`agent.md` / `AGENT.md` / `docs/CLOUD_AGENT_HANDOFF.md`) as needed.
- Commit, push, and update PR.
