# Agent handoff

This file is the canonical handoff for cloud agents and humans picking up work in this repository. Update it when you finish a meaningful slice so the next session starts from current truth.

## Current implementation snapshot

- **Unified dispatch**: `dispatchUnifiedMessage` in `src/runtime/unified-dispatch.ts` validates the envelope, calls `routeMessage`, runs the primary lane adapter, optionally runs fallback when primary fails and `failClosed` is false. When `memoryStore` / `capabilityRegistry` are set on `UnifiedRuntime`, dispatch passes `memorySnapshot` and per-lane `capabilityIds` into `LaneDispatchInput`, appends dispatch events, and on **pass** merges `last_lane`, `last_run_id`, `last_reason` into the store via optional `mergeWorkingSet`.
- **Policy router**: `src/router/policy-router.ts` — `@cursor` → Eve, `@hermes` → Hermes, else `defaultPrimary` / `defaultFallback` from config.
- **Control plane env**: `src/config/unified-control-plane-env.ts` — `loadUnifiedControlPlaneEnv()`, `applyLegacyUnifiedEnvShims()`, `LEGACY_ENV_ALIASES`, `emitLegacyEnvWarnings()` (stderr unless `VITEST=true` or `UNIFIED_SUPPRESS_LEGACY_WARNINGS=1`), `assertUnifiedControlPlaneEnv()` (includes `UNIFIED_STRICT_CONFIG` router validation). Fields: `memoryBackend` (`memory`|`file`), `memoryFilePath`, Telegram webhook settings.
- **Runtime factory**: `src/runtime/build-unified-runtime.ts` — picks `InMemoryUnifiedMemoryStore` vs `FileBackedUnifiedMemoryStore` from env.
- **Telegram gateway (Phase 1)**: `src/bin/telegram-gateway.ts` — envelope + `dispatchUnifiedMessage`; transcript under `UNIFIED_EVIDENCE_DIR`. `UNIFIED_TELEGRAM_GATEWAY_MODE=legacy` skips dispatch.
- **Telegram webhook server**: `src/bin/telegram-webhook.ts` — HTTP POST webhook (`npm run webhook:telegram`); requires `TELEGRAM_BOT_TOKEN`, optional `TELEGRAM_WEBHOOK_SECRET` header `X-Telegram-Bot-Api-Secret-Token`, maps `message` to dispatch, returns JSON.
- **Unified dispatch CLI**: `src/bin/unified-dispatch.ts` — stdout JSON only.
- **Adapters**: `EveAdapter` / `HermesAdapter` — pass `EVE_UNIFIED_MEMORY_JSON` / `HERMES_UNIFIED_MEMORY_JSON` and `*_UNIFIED_CAPABILITY_IDS` when present; Hermes and Eve non-timeout failures attach **`laneStdout` / `laneStderr`** (truncated via `truncateLaneIo` in `src/contracts/validate.ts`). `src/process/exec.ts` kills process group on timeout.
- **Memory**: `src/memory/unified-memory-store.ts` (`InMemoryUnifiedMemoryStore`), `src/memory/file-backed-unified-memory-store.ts` (JSON file, atomic rename).
- **Capabilities**: `src/capabilities/capability-registry.ts`.
- **CI stubs**: `scripts/ci-eve-dispatch-stub.sh`, `ci-hermes-dispatch-stub.sh`, `ci-sleep-hermes-stub.sh`, `ci-eve-exit7-stub.sh`, `ci-eve-invalid-json-stub.sh`; `scripts/ci-record-dispatch-evidence.sh`; `scripts/failure-injection-smoke.sh` matrix.
- **Contracts**: `src/contracts/types.ts` (`DispatchState` optional `laneStdout` / `laneStderr`) and `validate.ts`.
- **Tests**: `test/**/*.test.ts`; Vitest sets `VITEST=true` via `vitest.config.ts`.

## Design references (do not duplicate; link here)

- `docs/UNIFIED_ARCHITECTURE_SPEC.md` — target architecture.
- `docs/SUBSYSTEM_CONVERGENCE_PLAN.md` — phased ownership (gateway → policy → memory → skills → control plane).
- `docs/VALIDATION_HARDENING_MATRIX.md` — test classes and SLO gates.
- `docs/PRODUCTION_CUTOVER_RUNBOOK.md` — operational cutover.

## Scoped future tasks (priority-ordered)

1. **Policy and dispatch** — Done for current repo scope.

2. **Trace and failure** — Lane I/O on `DispatchState`; failure-injection matrix in CI. Remaining: optional redaction of secrets in `laneStderr`, Hermes structured stderr protocol.

3. **Gateway / Telegram** — CLI gateway + webhook server done. Remaining: TLS termination, `setWebhook` automation, production secret management, answer/sendMessage flow.

4. **Memory** — File-backed + merge on pass done. Remaining: multi-writer / HA store, Eve/Hermes native memory protocol (replace JSON env blobs).

5. **Control plane** — Strict router validation + deprecation warnings done. Remaining: optional JSON-schema or zod for full env, config file alongside env.

6. **Evidence and CI** — Failure-injection + gateway + artifact upload done. Remaining: soak/regression jobs publishing metrics bundles.

## Session log (append only)

| Date (UTC) | Branch / PR | Notes |
|------------|-------------|--------|
| 2026-04-28 | `cursor/agent-handoff-scope-5a8b` | Added this handoff doc; expanded `dispatchUnifiedMessage` tests for fail-closed and no-fallback config. |
| 2026-04-28 | `cursor/agent-handoff-scope-5a8b` | Policy version env; explicit lane dispatch tests; envelope trace fallback on unified response. |
| 2026-04-28 | `cursor/long-horizon-convergence-5a8b` | Memory store + capability registry + gateway CLI + control-plane env + exec timeout process-group kill + CI evidence + adapter/state failure paths. |
| 2026-04-28 | `cursor/long-horizon-convergence-5a8b` | File-backed memory, mergeWorkingSet on pass, adapter memory/cap env + lane I/O, Telegram webhook server, strict config + legacy warnings, expanded failure-injection + CI, Vitest VITEST env. |
