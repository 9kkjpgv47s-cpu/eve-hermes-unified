# Unified dispatch contract (H4)

This document describes **ingress and operator expectations** for the unified dispatch stack. Machine-enforced routing and response shapes live in `src/contracts/types.ts` and `src/contracts/validate.ts`.

## Ingress invariants

1. **Unified CLI**: Production-style handling uses `npm run dispatch` (`src/bin/unified-dispatch.ts`), which calls `dispatchUnifiedMessage` in `src/runtime/unified-dispatch.ts`.
2. **No parallel TypeScript ingress**: `EveAdapter` / `HermesAdapter` must not be constructed outside `src/bin/unified-dispatch.ts`, and `dispatchUnifiedMessage` must not be referenced outside `src/bin/unified-dispatch.ts` and `src/runtime/unified-dispatch.ts`.
3. **Scripts and docs**: Tracked shell harnesses may run the compiled `dist/src/bin/unified-dispatch.js` entry (or the TypeScript source path ending in `unified-dispatch.ts`) only from scripts explicitly allowlisted in `scripts/scan-legacy-dispatch-entrypoints.sh`. Do not add ad-hoc harness copies outside that allowlist.

## Deprecation map (legacy)

| Path / pattern | Status | Replacement |
|----------------|--------|----------------|
| Direct `new EveAdapter` / `new HermesAdapter` in `src/**/*.ts` (except unified bin) | **Deprecated** | `npm run dispatch` |
| Direct `dispatchUnifiedMessage` in `src/**/*.ts` outside runtime + bin | **Deprecated** | call through `src/bin/unified-dispatch.ts` |
| Direct Eve dispatch script name or Hermes `gateway` argv spelled as shell examples in `scripts/` or `docs/` | **CI-forbidden** | configure via env (see `.env.example`) |
| Invoking the `unified-dispatch` Node/TSX entry outside allowlisted harness scripts | **CI-forbidden** (enforced in `scripts/`, not in prose docs) | `npm run dispatch` or extend the allowlist deliberately |

## CI gate

```bash
npm run scan:legacy-dispatch-entrypoints
```

This runs after `npm run build` inside `npm run validate:all`.
