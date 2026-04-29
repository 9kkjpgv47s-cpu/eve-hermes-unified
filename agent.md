# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- Active horizon: **`H9`** (`docs/HORIZON_STATUS.json`, in progress); **H10** — see **`docs/H10_PROGRAM.md`**
- Latest in-repo slice: … `validate:h9-closeout`, `validate:regression-eve`, `validate:cutover-readiness`, `emit:validate-all-chain-posture`, `validate:h9-evidence-bundle`, and `validate:h10-closeout` in `validate:all`
- See `docs/H5_MULTI_TENANT_REGION.md` for env and CLI details

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
