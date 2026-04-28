# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- Active horizon: `H2` (`docs/HORIZON_STATUS.json`)
- Branch (at handoff time): `cursor/h2-stage-drill-orchestrator-0f91`
- Latest completed hardening slice:
  - closeout taxonomy normalization toward horizon-neutral signals
  - compatibility aliases preserved for H2-prefixed checks/failures
  - full validation passing
- **H3 durability slice (this branch):** `h3-action-1` and `h3-action-4` completed in `docs/HORIZON_STATUS.json`:
  - optional `UNIFIED_DISPATCH_DURABLE_WAL_PATH` + `npm run replay:dispatch-wal`
  - atomic file-backed memory writes + optional `UNIFIED_MEMORY_DUAL_WRITE_FILE_PATH`
  - `buildUnifiedDispatchRuntime` in `src/runtime/build-unified-dispatch-runtime.ts`

## What Was Just Completed

1. Canonical closeout gate signal added and propagated:
   - `horizon_closeout_gate_failed`
   - `horizonCloseoutGatePass`
2. Promotion/closeout gating now accepts canonical + legacy aliases:
   - canonical: `horizonCloseoutGatePass`, `closeoutRunCloseoutGate*`
   - legacy: `h2CloseoutGatePass`, `closeoutRunH2CloseoutGate*`
3. `run-h2-promotion` closeout-run failures now dual-report:
   - canonical: `horizon_closeout_run_*`
   - legacy/scoped aliases retained (including `h2_closeout_run_*` for H2)
4. **H3 (latest):** dispatch durable WAL + replay CLI, atomic memory persistence, dual-write shadow option, preflight for WAL/shadow paths.

## Read Order (Zero-Context Startup)

1. `README.md`
2. `AGENTS.md`
3. `AGENT.md`
4. `docs/CLOUD_AGENT_HANDOFF.md`
5. `docs/NEXT_LONG_HORIZON_ACTION_PLAN.md`
6. `docs/HORIZON_STATUS.json`

## Immediate Next High-Output Targets

1. Complete horizon-neutral taxonomy migration in `validate-horizon-closeout.mjs` for remaining H2-specific drill/check failure labels (keep compatibility aliases).
2. Extend canonical naming propagation into any remaining H2-specific orchestrator outputs that feed closeout/promotion gates.
3. Add targeted tests for canonical-first assertions with legacy alias compatibility.
4. Keep artifacts and gate outputs schema-valid under `scripts/validate-manifest-schema.mjs`.
5. **H3:** `h3-action-2` (policy-router fallback contracts), `h3-action-3` (capability execution budgets / timeouts), `h3-action-5` (soak drift tooling), `h3-action-6` (rollback rehearsal bundles).

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
