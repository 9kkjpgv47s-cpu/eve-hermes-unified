# Agent handoff

This file is the canonical handoff for cloud agents and humans picking up work in this repository. Update it when you finish a meaningful slice so the next session starts from current truth.

## Current implementation snapshot

- **Unified dispatch**: `dispatchUnifiedMessage` in `src/runtime/unified-dispatch.ts` validates the envelope, calls `routeMessage`, runs the primary lane adapter, optionally runs fallback when primary fails and `failClosed` is false. When `memoryStore` / `capabilityRegistry` are set on `UnifiedRuntime`, dispatch passes `memorySnapshot` and per-lane `capabilityIds` into `LaneDispatchInput`, appends dispatch events, and on **pass** merges `last_lane`, `last_run_id`, `last_reason` into the store via optional `mergeWorkingSet`.
- **Policy router**: `src/router/policy-router.ts` — `@cursor` → Eve, `@hermes` → Hermes, else `defaultPrimary` / `defaultFallback` from config.
- **Control plane env**: `src/config/unified-control-plane-env.ts` — `loadUnifiedControlPlaneEnv()`, `applyLegacyUnifiedEnvShims()`, `LEGACY_ENV_ALIASES`, `emitLegacyEnvWarnings()` (stderr unless `VITEST=true` or `UNIFIED_SUPPRESS_LEGACY_WARNINGS=1`), `assertUnifiedControlPlaneEnv()`. Includes `UNIFIED_LANE_IO_REDACT` (default **on**), `UNIFIED_LANE_IO_REDACT_CUSTOM`, `TELEGRAM_WEBHOOK_SEND_REPLY`, `TELEGRAM_WEBHOOK_PUBLIC_URL`.
- **Config file overlay**: `src/config/load-unified-config-file.ts` reads **`unified.config.json`** at repo root (gitignored); keys merge into `process.env` only when unset. Example: **`unified.config.example.json`** (safe to commit). `buildUnifiedRuntimeFromEnv` loads `.env` then JSON then env loader.
- **Package root**: `src/config/package-root.ts` — `resolvePackageRoot(import.meta.url)` so CLIs work from **`dist/`** without writing evidence under `dist/`.
- **Lane I/O redaction**: `src/config/lane-io-redact.ts` — `redactLaneIo` applied in Eve/Hermes adapters before `truncateLaneIo`.
- **Runtime factory**: `src/runtime/build-unified-runtime.ts` — memory backend + adapters with redact flags.
- **Telegram gateway**: `src/bin/telegram-gateway.ts` — transcript under `UNIFIED_EVIDENCE_DIR`. Legacy mode unchanged.
- **Telegram webhook**: `src/bin/telegram-webhook.ts` — optional **`TELEGRAM_WEBHOOK_SEND_REPLY=1`** → `sendMessage` with summary from `src/telegram/dispatch-reply-summary.ts`; response JSON includes `telegramReply` when enabled.
- **Telegram setWebhook CLI**: `src/bin/telegram-webhook-set.ts` — `npm run telegram:set-webhook -- --url https://host` (or `TELEGRAM_WEBHOOK_PUBLIC_URL`); uses `telegramSetWebhook` in `src/telegram/bot-api.ts`.
- **Soak / metrics**: `src/bin/soak-simulate.ts` — `npm run validate:soak` / `bash scripts/soak-simulate.sh [iterations]` writes **`evidence/soak-*.jsonl`** + **`evidence/soak-metrics-*.json`** (aggregates).
- **Unified dispatch CLI**: `src/bin/unified-dispatch.ts`.
- **Adapters**: Memory/cap env vars; lane stdout/stderr with redaction + truncation.
- **Memory / capabilities**: As before (`src/memory/*`, `src/capabilities/*`).
- **CI stubs / scripts**: `scripts/failure-injection-smoke.sh`, `ci-record-dispatch-evidence.sh`, `soak-simulate.sh` (delegates to compiled `soak-simulate.js` with stub env defaults).

## Design references (do not duplicate; link here)

- `docs/UNIFIED_ARCHITECTURE_SPEC.md` — target architecture.
- `docs/SUBSYSTEM_CONVERGENCE_PLAN.md` — phased ownership (gateway → policy → memory → skills → control plane).
- `docs/VALIDATION_HARDENING_MATRIX.md` — test classes and SLO gates.
- `docs/PRODUCTION_CUTOVER_RUNBOOK.md` — operational cutover.

## Scoped future tasks (priority-ordered)

1. **Policy and dispatch** — Done for current repo scope.

2. **Trace and failure** — Redaction + lane I/O done. Remaining: structured Hermes stderr protocol, richer redaction rules / allowlist.

3. **Gateway / Telegram** — Webhook + optional reply + setWebhook CLI done. Remaining: TLS termination in front of webhook, production secret vault, native `answer*` / inline keyboards if product needs.

4. **Memory** — File-backed + merge on pass done. Remaining: HA / multi-writer, replace JSON env blobs with native Eve/Hermes contracts.

5. **Control plane** — JSON overlay + strict router mode done. Remaining: full schema validation (zod) for all keys, hot reload.

6. **Evidence and CI** — Failure-injection + soak metrics + gateway + artifact upload done. Remaining: SLO gate thresholds in CI (fail job if success rate below N), soak duration matrix.

## Session log (append only)

| Date (UTC) | Branch / PR | Notes |
|------------|-------------|--------|
| 2026-04-28 | `cursor/agent-handoff-scope-5a8b` | Added this handoff doc; expanded `dispatchUnifiedMessage` tests for fail-closed and no-fallback config. |
| 2026-04-28 | `cursor/agent-handoff-scope-5a8b` | Policy version env; explicit lane dispatch tests; envelope trace fallback on unified response. |
| 2026-04-28 | `cursor/long-horizon-convergence-5a8b` | Memory store + capability registry + gateway CLI + control-plane env + exec timeout process-group kill + CI evidence + adapter/state failure paths. |
| 2026-04-28 | `cursor/long-horizon-convergence-5a8b` | File-backed memory, mergeWorkingSet on pass, adapter memory/cap env + lane I/O, Telegram webhook server, strict config + legacy warnings, expanded failure-injection + CI, Vitest VITEST env. |
| 2026-04-28 | `cursor/long-horizon-convergence-5a8b` | Lane I/O redaction, unified.config.json overlay, resolvePackageRoot for dist CLIs, soak-simulate Node + CI metrics, Telegram sendMessage reply + setWebhook CLI, webhook-set + bot-api helpers. |
