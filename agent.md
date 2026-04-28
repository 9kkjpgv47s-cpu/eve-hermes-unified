# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- Active horizon: `H2` (`docs/HORIZON_STATUS.json`)
- Branch (at handoff time): `cursor/horizon-drill-closeout-taxonomy-7d5a`
- Latest completed hardening slice:
  - horizon-closeout drill-suite verification uses canonical `horizon_drill_*` failure codes with legacy `h2_drill_*` dual-reporting
  - `run:h[1-5]-drill-suite` commands map to the same drill-suite evaluation path as `run:h2-drill-suite`

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

1. Complete horizon-neutral taxonomy migration for any remaining H2-only strings outside drill-suite closeout evaluation (keep compatibility aliases).
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
