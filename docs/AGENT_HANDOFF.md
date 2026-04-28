# Agent handoff

This file is the canonical handoff for cloud agents and humans picking up work in this repository. Update it when you finish a meaningful slice so the next session starts from current truth.

## Current implementation snapshot

- **Unified dispatch**: `dispatchUnifiedMessage` in `src/runtime/unified-dispatch.ts` validates the envelope, calls `routeMessage`, runs the primary lane adapter, optionally runs fallback when primary fails and `failClosed` is false. When `memoryStore` / `capabilityRegistry` are set on `UnifiedRuntime`, dispatch passes `memorySnapshot` and per-lane `capabilityIds` into `LaneDispatchInput` and appends dispatch events to the store.
- **Policy router**: `src/router/policy-router.ts` — `@cursor` → Eve, `@hermes` → Hermes, else `defaultPrimary` / `defaultFallback` from config.
- **Control plane env**: `src/config/unified-control-plane-env.ts` — `loadUnifiedControlPlaneEnv()`, `applyLegacyUnifiedEnvShims()`, `assertUnifiedPathsConfigured()`. Used by `src/runtime/build-unified-runtime.ts` and both CLIs.
- **Telegram gateway (Phase 1)**: `src/bin/telegram-gateway.ts` — builds envelope + `dispatchUnifiedMessage`; writes JSON transcript under `UNIFIED_EVIDENCE_DIR` (default `evidence/`). `UNIFIED_TELEGRAM_GATEWAY_MODE=legacy` skips dispatch (cutover flag).
- **Unified dispatch CLI**: `src/bin/unified-dispatch.ts` — same runtime builder, stdout JSON only (no transcript file).
- **Adapters**: `EveAdapter` / `HermesAdapter` — subprocess timeouts map to `*_dispatch_timeout` failed states; Eve handles missing/invalid state JSON. `src/process/exec.ts` kills the child process group on timeout so promises resolve promptly.
- **Memory (Phase 3 stub)**: `src/memory/unified-memory-store.ts` — `UnifiedMemoryStore` + `InMemoryUnifiedMemoryStore`.
- **Capabilities (Phase 4 stub)**: `src/capabilities/capability-registry.ts` — `CapabilityRegistry` + `defaultCapabilityCatalog`.
- **CI stubs**: `scripts/ci-eve-dispatch-stub.sh`, `scripts/ci-hermes-dispatch-stub.sh`, `scripts/ci-sleep-hermes-stub.sh`; `scripts/ci-record-dispatch-evidence.sh` runs gateway after `npm run build`.
- **Contracts**: `src/contracts/types.ts` and `validate.ts`.
- **Tests**: `test/*.test.ts` (Vitest).

## Design references (do not duplicate; link here)

- `docs/UNIFIED_ARCHITECTURE_SPEC.md` — target architecture.
- `docs/SUBSYSTEM_CONVERGENCE_PLAN.md` — phased ownership (gateway → policy → memory → skills → control plane).
- `docs/VALIDATION_HARDENING_MATRIX.md` — test classes and SLO gates.
- `docs/PRODUCTION_CUTOVER_RUNBOOK.md` — operational cutover.

## Scoped future tasks (priority-ordered)

These map to the convergence plan and close gaps versus the validation matrix.

1. **Policy and dispatch edge cases** — Done (tests + `UNIFIED_ROUTER_POLICY_VERSION`).

2. **Trace and failure classification** — Unified response trace fallback done; lane timeouts and Eve state parse failures covered. Remaining: richer failure-injection matrix in CI, Hermes stdout/stderr capture in `DispatchState` if product needs it.

3. **Phase 1 gateway (ingress)** — Done: `telegram-gateway` + `UNIFIED_TELEGRAM_GATEWAY_MODE` + CI evidence step. Remaining: real Telegram webhook process calling this binary with production env.

4. **Phase 3–4 (memory + capability registry)** — Interfaces + in-memory store + default catalog + dispatch wiring done. Remaining: persistent `UnifiedMemoryStore`, Eve/Hermes adapters consuming `memorySnapshot` / `capabilityIds`, upstream tool schemas.

5. **Control plane / config** — Done: centralized env loader + legacy shims + path validation + lane timeouts. Remaining: stricter schema (e.g. zod) and startup warnings for deprecated names only.

6. **Evidence and CI** — Done: `unified-ci` uploads `evidence/` artifact after gateway smoke; failure-injection script includes Hermes timeout case.

## Session log (append only)

| Date (UTC) | Branch / PR | Notes |
|------------|-------------|--------|
| 2026-04-28 | `cursor/agent-handoff-scope-5a8b` | Added this handoff doc; expanded `dispatchUnifiedMessage` tests for fail-closed and no-fallback config. |
| 2026-04-28 | `cursor/agent-handoff-scope-5a8b` | Policy version env; explicit lane dispatch tests; envelope trace fallback on unified response. |
| 2026-04-28 | `cursor/long-horizon-convergence-5a8b` | Memory store + capability registry + gateway CLI + control-plane env + exec timeout process-group kill + CI evidence + adapter/state failure paths. |
