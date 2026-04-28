# Agent handoff

This file is the canonical handoff for cloud agents working in this repository. Update it when you finish a slice of work so the next run has clear continuity.

## Current repository state

- **Unified dispatch** (`src/runtime/unified-dispatch.ts`): builds envelope, calls `routeMessage`, runs primary lane adapter, optionally fallback.
- **Policy router** (`src/router/policy-router.ts`): `@cursor` / `@hermes` prefixes and default lane from config; `failClosed` and `fallbackLane` are passed through on the decision object.
- **CLI** (`src/bin/unified-dispatch.ts`): loads `.env`, wires `EveAdapter` / `HermesAdapter`, reads `UNIFIED_ROUTER_*` env vars.
- **Contracts** (`src/contracts/types.ts`, `validate.ts`): envelope, routing decision, dispatch state, unified response.

## Scope for future tasks (ordered backlog)

Work should stay aligned with `docs/SUBSYSTEM_CONVERGENCE_PLAN.md`, `docs/UNIFIED_ARCHITECTURE_SPEC.md`, and `docs/VALIDATION_HARDENING_MATRIX.md`.

1. **Dispatch correctness and observability**
   - Ensure `UnifiedResponse.traceId` always matches the envelope trace (and document lane `traceId` overrides if adapters diverge).
   - Emit structured JSON suitable for log pipelines (optional flag on CLI).

2. **Policy engine**
   - Externalize policy version from env; add canary routing (e.g. allowlist `chatId` → Hermes-primary) per production runbook stages.
   - Map failure taxonomy from adapters into policy hints (without breaking Eve production paths).

3. **Adapters and integration**
   - Hermes: consume structured exit / stdout contract instead of exit-code-only success.
   - Eve: document required JSON shape at `EVE_DISPATCH_RESULT_PATH`; add integration tests behind mocks or recorded fixtures.

4. **Validation hardening**
   - Automate failure-injection scenarios from `docs/VALIDATION_HARDENING_MATRIX.md` in CI where feasible.
   - Extend contract tests for edge cases (empty metadata, long text) as the gateway converges.

5. **Control plane**
   - Single schema for router + adapter env (see convergence plan phase 5); compatibility aliases for legacy names.

## Completed in this handoff slice

- Added `docs/AGENT_HANDOFF.md` (this file) with backlog scope.
- Extended `test/unified-dispatch.test.ts` with cases for **fail-closed** (no fallback when primary fails) and **no fallback lane** (`fallbackLane: "none"`).

## Notes for the next agent

- Default paths in `.env.example` / CLI still point at developer-specific filesystem locations; prefer documenting workspace-relative or env-only deployment patterns when touching bootstrap docs.
- Run `npm run check` and `npm test` before pushing.
