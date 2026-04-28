# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- Active horizon: `H2` (`docs/HORIZON_STATUS.json`). H3 actions **h3-action-1** … **h3-action-6** are **completed**. H4 **h4-action-1** and **h4-action-2** are **completed** (inventory + versioned dispatch fixtures).
- Branch: **`cursor/h4-inventory-fixtures-cc15`** — H4 legacy-path inventory, **`DISPATCH_FIXTURE_SCHEMA_VERSION`**, `fixtures/dispatch/*.json`, **`test/dispatch-conformance-fixtures.test.ts`**, progressive runway rows for **H4→H5**, soak script fix.

## What Was Just Completed (large chunk)

### H4 (this iteration)

1. **`docs/H4_DIRECT_LANE_INVOCATION_INVENTORY.md`** — documents that production lane subprocess use is **`src/bin/unified-dispatch.ts` → `LaneAdapter`** only; adapters live under `src/adapters/`.
2. **Versioned dispatch fixtures** — `fixtures/dispatch/v1-lane-pass.json`, `v1-lane-fallback.json`; constant **`DISPATCH_FIXTURE_SCHEMA_VERSION`** in `src/contracts/dispatch-fixture-version.ts`; Vitest **`dispatch-conformance-fixtures.test.ts`** asserts **`dispatchUnifiedMessage`** vs fixtures.
3. **`docs/HORIZON_STATUS.json`** — mark **h4-action-1**, **h4-action-2** completed; add pending **h4-action-3** … **h4-action-6** and **h5-action-1** … **h5-action-5** so **H3→H4** and **H4→H5** progressive goal checks pass.
4. **`scripts/soak-append-meta.mjs`** — removed invalid TypeScript `as` cast so Node ESM loads correctly (unblocks **`validate:soak`** / **`validate:all`**).

### Carry-forward (same branch / prior commits)

- H3: dispatch queue journal, memory durability verify, capability output + lane-dispatch budgets, soak SLO validator, emergency rollback bundle, progressive goals semantics — see `docs/CLOUD_AGENT_HANDOFF.md`.

## Read Order (Zero-Context Startup)

1. `README.md`
2. `AGENTS.md`
3. `AGENT.md`
4. `docs/CLOUD_AGENT_HANDOFF.md`
5. `docs/H4_DIRECT_LANE_INVOCATION_INVENTORY.md`
6. `docs/NEXT_LONG_HORIZON_ACTION_PLAN.md`
7. `docs/HORIZON_STATUS.json`

## Immediate Next High-Output Targets

1. **`h4-action-3`** … **`h4-action-6`** — H4 closeout scope, capability contract extensions, memory audit (see `docs/HORIZON_STATUS.json`).
2. **`h5-action-1`** … **`h5-action-5`** — H5 runway (autonomous ops envelope, scale targets, rollback drills).
3. Keep **`npm run check && npm test && npm run validate:all`** green before merge.

## Validation Pack

```bash
npm run check
npm test
npm run validate:all
```

## Guardrails

- Persist verify and journal replay verify are **fail-fast** when enabled.
- Bump `UNIFIED_DISPATCH_AUDIT_SCHEMA_VERSION` when changing dispatch audit record shape.
- Bump **`DISPATCH_FIXTURE_SCHEMA_VERSION`** when changing `fixtures/dispatch` contract shape.

## Delivery Checklist Per Iteration

- Implement + tests + docs for operator-visible behavior.
- Commit, push, open/update PR.
