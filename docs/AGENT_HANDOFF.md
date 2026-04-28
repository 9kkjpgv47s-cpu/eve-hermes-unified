# Agent handoff

This file is the canonical handoff for cloud agents and humans picking up work in this repository. Update it when you finish a meaningful slice so the next session starts from current truth.

## Current implementation snapshot

- **Unified dispatch**: `dispatchUnifiedMessage` in `src/runtime/unified-dispatch.ts` — envelope, policy router, primary/fallback lanes, optional `memoryStore` / `capabilityRegistry`, **`dispatchHooks.afterPrimary` / `afterFallback`** for telemetry (lane `DispatchState` including `elapsedMs`).
- **Policy router**: `src/router/policy-router.ts` — `@cursor` → Eve, `@hermes` → Hermes, else defaults.
- **Control plane env**: `src/config/unified-control-plane-env.ts` — sync **`assertUnifiedControlPlaneEnv`**, async **`assertUnifiedControlPlaneEnvAsync`** (path checks when **`UNIFIED_VALIDATE_PATHS=1`** via `src/config/path-exists.ts`). TLS pair consistency. **`validateUnifiedControlPlaneEnvZod`** extended with **`eveTaskDispatchScript`**, **`eveDispatchResultPath`**, **`hermesLaunchCommand`** when Zod runs.
- **Runtime factory**: `src/runtime/build-unified-runtime.ts` — loads `.env`, **`unified.config.json`**, **`hydrateTelegramTokenFromFile`**, then **`assertUnifiedControlPlaneEnvAsync`**.
- **Hermes stderr protocol**: `src/adapters/hermes-stderr-protocol.ts` — lines `UNIFIED_HERMES_JSON:{...}` may set **`failureClass`** (canonical enum) and append reason; **`HermesAdapter`** applies on failure.
- **File memory HA-ish**: `src/memory/file-backed-unified-memory-store.ts` — **`rename`** to target retried on **EBUSY/EPERM/EXDEV** with backoff.
- **Soak**: `src/bin/soak-simulate.ts` — per-iteration **`wallClockMs`** in JSONL; metrics add **`wallClockMs`**, **`p95DispatchWallMs`**, **`p95LaneElapsedMs`** (`src/soak/latency-stats.ts`).
- **CI SLO**: `src/bin/ci-slo-gate-soak.ts` — success rate plus optional **`UNIFIED_SOAK_MAX_WALL_MS`**, **`UNIFIED_SOAK_MAX_P95_WALL_MS`**, **`UNIFIED_SOAK_MAX_P95_LANE_MS`** (CLI `--max-*` overrides).
- **Soak matrix**: `scripts/soak-matrix-ci.sh` + **`npm run validate:soak-matrix`** — runs in-memory then file-backed soak + SLO each; CI uses this instead of a single soak step.
- **Telegram / gateway / rest**: unchanged from prior slices (webhook TLS, token file, set-webhook, etc.).

## Design references (do not duplicate; link here)

- `docs/UNIFIED_ARCHITECTURE_SPEC.md` — target architecture.
- `docs/SUBSYSTEM_CONVERGENCE_PLAN.md` — phased ownership (gateway → policy → memory → skills → control plane).
- `docs/VALIDATION_HARDENING_MATRIX.md` — test classes and SLO gates.
- `docs/PRODUCTION_CUTOVER_RUNBOOK.md` — operational cutover.

## Scoped future tasks (priority-ordered)

1. **Policy and dispatch** — Done for current repo scope.

2. **Trace and failure** — Hermes structured stderr + lane hooks done. Remaining: redaction allowlist, Eve-side structured protocol.

3. **Gateway / Telegram** — Prior work stands. Remaining: mTLS, external vault, rate limits.

4. **Memory** — File store retries + dual-backend soak matrix done. Remaining: true multi-writer / HA (leases, CRDT), Eve/Hermes native memory contracts.

5. **Control plane** — Path validation + expanded Zod paths done. Remaining: hot reload, validate Hermes args array contents.

6. **Evidence and CI** — Soak matrix + latency SLO fields in metrics + gate done. Remaining: soak duration tiers as separate jobs, latency regression baselines.

## Session log (append only)

| Date (UTC) | Branch / PR | Notes |
|------------|-------------|--------|
| 2026-04-28 | `cursor/agent-handoff-scope-5a8b` | Added this handoff doc; expanded `dispatchUnifiedMessage` tests for fail-closed and no-fallback config. |
| 2026-04-28 | `cursor/agent-handoff-scope-5a8b` | Policy version env; explicit lane dispatch tests; envelope trace fallback on unified response. |
| 2026-04-28 | `cursor/long-horizon-convergence-5a8b` | Memory store + capability registry + gateway CLI + control-plane env + exec timeout process-group kill + CI evidence + adapter/state failure paths. |
| 2026-04-28 | `cursor/long-horizon-convergence-5a8b` | File-backed memory, mergeWorkingSet on pass, adapter memory/cap env + lane I/O, Telegram webhook server, strict config + legacy warnings, expanded failure-injection + CI, Vitest VITEST env. |
| 2026-04-28 | `cursor/long-horizon-convergence-5a8b` | Lane I/O redaction, unified.config.json overlay, resolvePackageRoot for dist CLIs, soak-simulate Node + CI metrics, Telegram sendMessage reply + setWebhook CLI, webhook-set + bot-api helpers. |
| 2026-04-28 | `cursor/long-horizon-convergence-5a8b` | Zod validate subset (`UNIFIED_ZOD_VALIDATE` / strict), HTTPS webhook (TLS PEM paths), `TELEGRAM_BOT_TOKEN_FILE`, CI soak SLO gate (`validate:ci-slo`, min rate 0.99), dependency `zod`. |
| 2026-04-28 | `cursor/long-horizon-convergence-5a8b` | Dispatch hooks for soak; soak latency metrics + SLO env; Hermes `UNIFIED_HERMES_JSON` stderr protocol; file memory rename retries; `UNIFIED_VALIDATE_PATHS`; soak matrix CI script; expanded Zod for script paths. |
