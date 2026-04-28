# Agent handoff

This file is the canonical handoff for cloud agents and humans picking up work in this repository. Update it when you finish a meaningful slice so the next session starts from current truth.

## Current implementation snapshot

- **Unified dispatch**: `dispatchUnifiedMessage` in `src/runtime/unified-dispatch.ts` validates the envelope, calls `routeMessage`, runs the primary lane adapter, optionally runs fallback when primary fails and `failClosed` is false.
- **Policy router**: `src/router/policy-router.ts` — `@cursor` → Eve, `@hermes` → Hermes, else `defaultPrimary` / `defaultFallback` from config.
- **Adapters**: `EveAdapter` (shell script + JSON state file), `HermesAdapter` (subprocess). CLI: `src/bin/unified-dispatch.ts` with env from `.env.example`.
- **Contracts**: `src/contracts/types.ts` and `validate.ts` — envelope, routing decision, dispatch state, unified response.
- **Tests**: `test/unified-dispatch.test.ts`, `test/policy-router.test.ts` (Vitest).

## Design references (do not duplicate; link here)

- `docs/UNIFIED_ARCHITECTURE_SPEC.md` — target architecture.
- `docs/SUBSYSTEM_CONVERGENCE_PLAN.md` — phased ownership (gateway → policy → memory → skills → control plane).
- `docs/VALIDATION_HARDENING_MATRIX.md` — test classes and SLO gates.
- `docs/PRODUCTION_CUTOVER_RUNBOOK.md` — operational cutover.

## Scoped future tasks (priority-ordered)

These map to the convergence plan and close gaps versus the validation matrix.

1. **Policy and dispatch edge cases**  
   - Tests: fail-closed (no fallback when `failClosed: true`), `fallbackLane: "none"`, explicit `@cursor` / `@hermes` through full `dispatchUnifiedMessage`.  
   - Optional: propagate `UNIFIED_ROUTER_POLICY_VERSION` from env into `routerConfig` in the CLI for trace parity with decisions.

2. **Trace and failure classification**  
   - Ensure every response path preserves envelope `traceId` (or a documented merge rule) and that adapters never emit empty `traceId`.  
   - Extend failure-injection scripts or tests for timeout / non-zero exit scenarios in `scripts/failure-injection-smoke.sh`.

3. **Phase 1 gateway (ingress)**  
   - When Eve/Hermes sources are available in CI, wire or document Telegram ingress calling `dispatchUnifiedMessage` once; keep legacy paths behind feature flags per runbook.

4. **Phase 3–4 (memory + capability registry)**  
   - Introduce `UnifiedMemoryStore` and shared capability registry interfaces; stub adapters until pinned upstream contracts exist.

5. **Control plane / config**  
   - Consolidate env schema (document + validate at startup); legacy env shims per convergence plan Phase 5.

6. **Evidence and CI**  
   - Capture JSON transcripts in CI for contract/integration runs where feasible; align with “Evidence bundle” in the hardening matrix.

## Session log (append only)

| Date (UTC) | Branch / PR | Notes |
|------------|-------------|--------|
| 2026-04-28 | `cursor/agent-handoff-scope-5a8b` | Added this handoff doc; expanded `dispatchUnifiedMessage` tests for fail-closed and no-fallback config. |
