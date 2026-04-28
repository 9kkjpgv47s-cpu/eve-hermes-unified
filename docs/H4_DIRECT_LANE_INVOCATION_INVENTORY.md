# H4: Direct Eve / Hermes invocation inventory

This inventory supports **h4-action-1** (retirement scope for legacy paths outside unified dispatch).

## Canonical entrypoint

- **Unified dispatch:** `src/bin/unified-dispatch.ts` — loads config, constructs **`EveAdapter`** and **`HermesAdapter`**, wires **`dispatchLane`** into the capability registry, then calls **`dispatchUnifiedMessage`** (`src/runtime/unified-dispatch.ts`). Lane subprocesses / scripts are invoked **only** through **`LaneAdapter.dispatch`** from this path (primary, fallback, or capability-driven sub-dispatch).

## Lane adapters (implementation of `LaneAdapter`)

| Location | Role |
|----------|------|
| `src/adapters/eve-adapter.ts` | Invokes external Eve dispatch script; returns **`DispatchState`**. |
| `src/adapters/hermes-adapter.ts` | Invokes Hermes launch command; returns **`DispatchState`**. |

These classes are **not** constructed elsewhere in `src/` (only `unified-dispatch.ts` CLI).

## Tests and tooling (intentional fakes / smoke)

- **Vitest:** `FakeLaneAdapter` / `StaticLaneAdapter` in tests (e.g. `test/unified-dispatch.test.ts`, `test/dispatch-conformance-fixtures.test.ts`) — in-process stubs, not production Eve/Hermes binaries.
- **Shell scripts:** `scripts/soak-simulate.sh`, `scripts/regression-eve-primary.sh`, and similar call **`unified-dispatch`** (or `dist/.../unified-dispatch.js`), not adapters directly.

## Out of scope for this repo

Downstream **Eve** and **Hermes** repositories (dispatch scripts, launchers) are invoked as **configured subprocesses**; their internal call graphs are not tracked here. Retirement work in H4+ should treat **`dispatchUnifiedMessage`** + **`LaneAdapter`** as the only supported integration surface for new code in **this** tree.

## Versioned conformance

- **Fixtures:** `fixtures/dispatch/*.json` — version field **`dispatchFixtureSchemaVersion`** (must match **`DISPATCH_FIXTURE_SCHEMA_VERSION`** in `src/contracts/dispatch-fixture-version.ts`).
- **Tests:** `test/dispatch-conformance-fixtures.test.ts` loads fixtures and asserts **`UnifiedDispatchResult`** shape against **`dispatchUnifiedMessage`**.
