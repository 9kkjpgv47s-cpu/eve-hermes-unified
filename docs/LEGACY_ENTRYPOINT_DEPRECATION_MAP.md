# Legacy entrypoint deprecation map

Canonical production ingress for Eve/Hermes unified routing is **`src/bin/unified-dispatch.ts`** (built to `dist/src/bin/unified-dispatch.js`). Adapters must be composed only there so policy, capability selection, audit, and durability hooks stay consistent.

## Canonical path

| Component | Role |
|-----------|------|
| `npm run dispatch` / `tsx src/bin/unified-dispatch.ts` | Single operator and automation entrypoint |
| `dispatchUnifiedMessage` / `dispatchUnifiedEnvelope` | Core runtime (`src/runtime/unified-dispatch.ts`) |

## Deprecated patterns

| Pattern | Status | Migration |
|---------|--------|-----------|
| `new EveAdapter(` / `new HermesAdapter(` in any `src/**/*.ts` **except** `src/bin/unified-dispatch.ts` | **Disallowed** (CI: `npm run validate:unified-entrypoints`) | Import and run through the unified CLI or call dispatch helpers in tests with fake adapters |
| Direct shell scripts that invoke Eve/Hermes binaries **without** going through unified dispatch env wiring | **Discouraged** | Prefer `npm run dispatch` with `UNIFIED_*` env vars or documented soak/smoke wrappers |
| Shell scripts that invoke unified dispatch | **Must** resolve via `scripts/unified-dispatch-runner.sh` (`resolve_unified_dispatch` → `UNIFIED_DISPATCH_CMD`) so CI works without a prior `npm run build` when dist is absent (**H14**). **H15:** `npm run validate:shell-unified-dispatch-ci` blocks new direct `node`/`tsx` or `dist/.../unified-dispatch` invocations in other `scripts/*.sh` files. |
| Embedding router defaults only in ad-hoc scripts | **Discouraged** | Use `loadUnifiedRuntimeEnvConfig()` / `.env` keys documented in `.env.example` |

## Compatibility shims

Runtime config still accepts legacy env aliases (for example `EVE_TASK_DISPATCH_SCRIPT` alongside `UNIFIED_EVE_TASK_DISPATCH_SCRIPT`). These are **not** separate ingress paths; they are parse aliases inside `unified-runtime-config.ts`. New integrations should prefer `UNIFIED_*` names. **H4:** keep aliases until operator configs standardize; removal is a breaking change and needs an explicit integration audit.

## Contract versioning

`UnifiedDispatchResult` and related types are versioned as **`UNIFIED_DISPATCH_CONTRACT_VERSION`** in `src/contracts/schema-version.ts` (currently **`v1`**). Fixture files under `test/fixtures/contracts/` must validate with `validateUnifiedDispatchResult` for each supported revision.
