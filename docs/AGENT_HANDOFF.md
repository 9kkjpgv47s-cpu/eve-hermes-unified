# Agent handoff

This file is the canonical handoff for cloud agents and humans picking up work in this repository. Update it when you finish a meaningful slice so the next session starts from current truth.

## Current implementation snapshot

- **Unified dispatch**: `dispatchUnifiedMessage` in `src/runtime/unified-dispatch.ts` validates the envelope, calls `routeMessage`, runs the primary lane adapter, optionally runs fallback when primary fails and `failClosed` is false. When `memoryStore` / `capabilityRegistry` are set on `UnifiedRuntime`, dispatch passes `memorySnapshot` and per-lane `capabilityIds` into `LaneDispatchInput`, appends dispatch events, and on **pass** merges `last_lane`, `last_run_id`, `last_reason` into the store via optional `mergeWorkingSet`.
- **Policy router**: `src/router/policy-router.ts` — `@cursor` → Eve, `@hermes` → Hermes, else `defaultPrimary` / `defaultFallback` from config.
- **Control plane env**: `src/config/unified-control-plane-env.ts` — `loadUnifiedControlPlaneEnv()`, `applyLegacyUnifiedEnvShims()`, `LEGACY_ENV_ALIASES`, `emitLegacyEnvWarnings()`, `assertUnifiedControlPlaneEnv()` (router strict mode, **TLS cert/key pair** consistency). **`validateUnifiedControlPlaneEnvZod`** in `src/config/unified-env-zod.ts` runs when **`UNIFIED_ZOD_VALIDATE=1`** or **`UNIFIED_STRICT_CONFIG=1`**.
- **Config file overlay**: `src/config/load-unified-config-file.ts` reads **`unified.config.json`** (gitignored); **`unified.config.example.json`** is committed.
- **Telegram token file**: `src/config/telegram-token-file.ts` — **`hydrateTelegramTokenFromFile()`** reads **`TELEGRAM_BOT_TOKEN_FILE`** into `TELEGRAM_BOT_TOKEN` when unset; called from **`buildUnifiedRuntimeFromEnv`** and Telegram CLIs before `loadUnifiedControlPlaneEnv`.
- **Telegram webhook**: `src/bin/telegram-webhook.ts` — HTTP or **HTTPS** when **`TELEGRAM_WEBHOOK_TLS_CERT`** + **`TELEGRAM_WEBHOOK_TLS_KEY`** are set; optional **`TELEGRAM_WEBHOOK_SEND_REPLY`**. **`src/telegram/bot-api.ts`** — `sendMessage` / `setWebhook`.
- **Telegram setWebhook CLI**: `src/bin/telegram-webhook-set.ts` — `npm run telegram:set-webhook`.
- **CI SLO gate**: `src/bin/ci-slo-gate-soak.ts` — **`npm run validate:ci-slo`** reads latest **`evidence/soak-metrics-*.json`** (or **`--metrics-file`**) and fails if success rate is below **`UNIFIED_SOAK_MIN_SUCCESS_RATE`** (default **1**). CI runs soak then this gate at **0.99**.
- **Soak**: `src/bin/soak-simulate.ts` + `scripts/soak-simulate.sh` — JSONL + metrics under **`evidence/`**.
- **Package root**: `src/config/package-root.ts` — `resolvePackageRoot` for `dist/` CLIs.
- **Lane I/O redaction**: `src/config/lane-io-redact.ts` in adapters.
- **Memory / capabilities / runtime factory**: as before.

## Design references (do not duplicate; link here)

- `docs/UNIFIED_ARCHITECTURE_SPEC.md` — target architecture.
- `docs/SUBSYSTEM_CONVERGENCE_PLAN.md` — phased ownership (gateway → policy → memory → skills → control plane).
- `docs/VALIDATION_HARDENING_MATRIX.md` — test classes and SLO gates.
- `docs/PRODUCTION_CUTOVER_RUNBOOK.md` — operational cutover.

## Scoped future tasks (priority-ordered)

1. **Policy and dispatch** — Done for current repo scope.

2. **Trace and failure** — Redaction + lane I/O done. Remaining: structured Hermes stderr protocol, richer redaction allowlist.

3. **Gateway / Telegram** — Webhook HTTPS + token file + reply + setWebhook done. Remaining: mTLS, external secret vault, `answerInlineQuery`, rate limits.

4. **Memory** — File-backed + merge on pass done. Remaining: HA / multi-writer, native Eve/Hermes memory contracts.

5. **Control plane** — Zod subset + strict + JSON overlay done. Remaining: hot reload, validate every env key including paths to scripts.

6. **Evidence and CI** — Failure-injection + soak + **SLO gate** + gateway + artifact upload done. Remaining: latency thresholds in metrics, multi-stage soak matrix.

## Session log (append only)

| Date (UTC) | Branch / PR | Notes |
|------------|-------------|--------|
| 2026-04-28 | `cursor/agent-handoff-scope-5a8b` | Added this handoff doc; expanded `dispatchUnifiedMessage` tests for fail-closed and no-fallback config. |
| 2026-04-28 | `cursor/agent-handoff-scope-5a8b` | Policy version env; explicit lane dispatch tests; envelope trace fallback on unified response. |
| 2026-04-28 | `cursor/long-horizon-convergence-5a8b` | Memory store + capability registry + gateway CLI + control-plane env + exec timeout process-group kill + CI evidence + adapter/state failure paths. |
| 2026-04-28 | `cursor/long-horizon-convergence-5a8b` | File-backed memory, mergeWorkingSet on pass, adapter memory/cap env + lane I/O, Telegram webhook server, strict config + legacy warnings, expanded failure-injection + CI, Vitest VITEST env. |
| 2026-04-28 | `cursor/long-horizon-convergence-5a8b` | Lane I/O redaction, unified.config.json overlay, resolvePackageRoot for dist CLIs, soak-simulate Node + CI metrics, Telegram sendMessage reply + setWebhook CLI, webhook-set + bot-api helpers. |
| 2026-04-28 | `cursor/long-horizon-convergence-5a8b` | Zod validate subset (`UNIFIED_ZOD_VALIDATE` / strict), HTTPS webhook (TLS PEM paths), `TELEGRAM_BOT_TOKEN_FILE`, CI soak SLO gate (`validate:ci-slo`, min rate 0.99), dependency `zod`. |
