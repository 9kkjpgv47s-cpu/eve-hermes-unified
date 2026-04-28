# Legacy entrypoint deprecation map (Horizon H4)

Canonical production ingress for Eve/Hermes convergence is **`dispatchUnifiedMessage`** / **`dispatchUnifiedEnvelope`** via **`npm run dispatch`** (`src/bin/unified-dispatch.ts`). Lane adapters remain implementation details behind that binary.

| Legacy / alternate path | Status | Canonical replacement | Notes |
|-------------------------|--------|-------------------------|-------|
| Direct `EveAdapter` / `HermesAdapter` construction outside `src/bin/unified-dispatch.ts` | **Deprecated** | Unified dispatch CLI or programmatic `dispatchUnifiedMessage` with injected adapters in tests | Enforced by `npm run validate:unified-entrypoints` |
| Shell scripts invoking `eve-task-dispatch.sh` or Hermes Python entrypoints directly for user traffic | **Deprecated** | Route through unified dispatch (adapters wrap those binaries internally) | Allowed for bootstrap/dev docs referencing paths |
| Bypassing `UnifiedMessageEnvelope` / `UnifiedDispatchResult` contracts | **Deprecated** | Use `src/contracts/types.ts` + `validate.ts` | Fixture version under `test/fixtures/contracts/` |

## Contract versioning

Runtime payloads align with **`UNIFIED_DISPATCH_CONTRACT_VERSION`** in `src/contracts/schema-version.ts`. Operators upgrading integrations should diff fixtures when this version bumps.
