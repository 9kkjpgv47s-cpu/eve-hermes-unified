# Legacy Path Retirement Map (H4)

Canonical production ingress for unified routing and lane execution is:

- **CLI:** `npm run dispatch` → `src/bin/unified-dispatch.ts` → `dispatchUnifiedMessage` → lane adapters.

## Deprecated / discouraged paths

| Path | Status | Replacement | Notes |
|------|--------|-------------|--------|
| Direct `EveAdapter` / `HermesAdapter` construction in application code | **Discouraged** | Build `UnifiedRuntime` and call `dispatchUnifiedMessage` (or use the CLI) | Keeps one policy point, trace model, capability path, and audit hooks aligned. |
| Calling `eve-task-dispatch.sh` or Hermes launch commands **without** going through unified dispatch | **Out of scope for this repo’s contract** | Same as above | External operators may still run scripts for debugging; production traffic should use unified dispatch. |

## Static guard

`test/unified-dispatch-entrypoint-guard.test.ts` asserts `src/bin/unified-dispatch.ts` remains the **only** production entry file that constructs both lane adapters, so new bypass paths are caught in CI.

## Contract versioning

Dispatch JSONL audit lines include `auditSchemaVersion` (see `src/contracts/dispatch-audit-version.ts`). Bump when changing the audit record shape.

Validate captured audit artifacts (optional CI / evidence gate):

```bash
node scripts/validate-manifest-schema.mjs --type unified-dispatch-audit-jsonl --file path/to/unified-dispatch-audit-*.jsonl
```

Files under `evidence/` named `unified-dispatch-audit-*.jsonl` are also checked when running `npm run validate:manifest-schemas` (`--type all`).
