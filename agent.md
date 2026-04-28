# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- Active horizon: `H2` (`docs/HORIZON_STATUS.json`). H3 **h3-action-1** … **h3-action-6** completed. H4 **h4-action-1** … **h4-action-6** completed (inventory, dispatch fixtures, H4 closeout evidence bundle + gates, memory audit doc, tenant-metadata contract test, H5 planning doc + runway actions **h5-action-1** … **h5-action-7**).
- Branch: **`cursor/h4-inventory-fixtures-cc15`** (or successor) — merge after CI green.

## What Was Just Completed (large chunk)

### H4 closeout + H5 runway

1. **`scripts/h4-closeout-evidence.mjs`** + **`npm run bundle:h4-closeout-evidence`** / **`verify:h4-closeout-evidence`** — bundles **dispatch fixture Vitest** + **`memory-audit-report`** JSON; optional **`emergency-rollback-bundle`** schema check when present.
2. **`src/bin/memory-audit-report.ts`** — cross-lane + WAL replay invariant JSON for H4 memory audit.
3. **`validate-manifest-schema.mjs`** — new type **`h4-closeout-evidence`**; **`--type all`** includes latest **`h4-closeout-evidence-*.json`**.
4. **`validate-horizon-closeout.mjs`** — evaluates **`npm run verify:h4-closeout-evidence`** artifacts.
5. **`docs/HORIZON_STATUS.json`** — **`requiredEvidence`** entry **`h4-closeout-evidence`** scoped to **H4**; progressive **H4→H5** still passes with new H5 actions.
6. **Docs:** `docs/H4_UNIFIED_MEMORY_AUDIT.md`, `docs/H5_AUTONOMOUS_OPS_ENVELOPE.md`.
7. **Tests:** `test/h4-closeout-evidence-script.test.ts`, manifest schema test, **`unified-dispatch`** tenant metadata test.
8. **CI:** `.github/workflows/unified-ci.yml` runs **`bundle:h4-closeout-evidence`** after **`validate:manifest-schemas`**.

### Carry-forward

- H3 durability, soak SLO, emergency rollback bundle, capability budgets — see `docs/CLOUD_AGENT_HANDOFF.md`.

## Read Order (Zero-Context Startup)

1. `README.md`
2. `AGENTS.md`
3. `AGENT.md`
4. `docs/CLOUD_AGENT_HANDOFF.md`
5. `docs/H4_DIRECT_LANE_INVOCATION_INVENTORY.md`
6. `docs/H4_UNIFIED_MEMORY_AUDIT.md`
7. `docs/H5_AUTONOMOUS_OPS_ENVELOPE.md`
8. `docs/NEXT_LONG_HORIZON_ACTION_PLAN.md`
9. `docs/HORIZON_STATUS.json`

## Immediate Next High-Output Targets

1. **Execute H5 actions** — implement SLO automation, soak job integration, and runbook updates per `docs/H5_AUTONOMOUS_OPS_ENVELOPE.md` (status rows **h5-action-1** … **h5-action-7** are still **planned**).
2. **Real H4 closeout run** — when promoting H4, run full **`npm run validate:h4-closeout`** with complete **`evidence/`** (release-readiness, merge-bundle, stage promotion, **`promotionReadiness.targetStage: full`** for H5) plus **`bundle:h4-closeout-evidence`**.
3. Keep **`npm run check && npm test && npm run validate:all`** green.

## Validation Pack

```bash
npm run check
npm test
npm run validate:all
npm run bundle:h4-closeout-evidence
```

## Guardrails

- Bump **`DISPATCH_FIXTURE_SCHEMA_VERSION`** when changing `fixtures/dispatch` contract shape.
- Bump **`UNIFIED_DISPATCH_AUDIT_SCHEMA_VERSION`** when changing dispatch audit record shape.

## Delivery Checklist Per Iteration

- Implement + tests + docs for operator-visible behavior.
- Commit, push, open/update PR.
