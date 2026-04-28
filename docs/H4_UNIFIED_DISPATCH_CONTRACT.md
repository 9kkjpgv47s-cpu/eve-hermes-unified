# H4 unified dispatch contract

This document defines the **machine- and human-readable** contract for `UnifiedDispatchResult` objects emitted by `dispatchUnifiedMessage` and the `npm run dispatch` CLI.

## Contract version

- **Current:** `2026-04-28-h4-v1` (see `UNIFIED_DISPATCH_CONTRACT_VERSION` in `src/contracts/dispatch-contract.ts`).
- **Schema reference:** `docs/H4_UNIFIED_DISPATCH_CONTRACT.md` (also stamped as `contractSchemaRef` on each result).

Downstream consumers should pin to `contractVersion` and treat unknown versions as requiring a compatibility review.

## Core invariants

1. **Envelope:** `traceId`, `channel` (`telegram`), `chatId`, `messageId`, `receivedAtIso`, and non-empty `text`.
2. **Routing:** `primaryLane`, `fallbackLane` (`eve` | `hermes` | `none`), `reason`, `policyVersion`, `failClosed`. Optional `dispatchFailureClassesAllowingFallback` restricts when automatic fallback may run after a primary failure.
3. **Dispatch states:** `primaryState` and optional `fallbackState` carry canonical `traceId`, `failureClass`, and `runId`.
4. **Response:** `response.traceId` matches envelope; `laneUsed` reflects the effective lane for the operator-visible outcome.
5. **Capability path:** When `capabilityDecision` / `capabilityExecution` are present, routing uses the capability lane with `fallbackLane: none` for that path.
6. **Policy-gated fallback:** When `primaryFallbackLimited` is `true`, automatic cross-lane fallback was skipped by policy; `fallbackState` and `fallbackInfo` must be absent.
7. **Contract fields:** `contractVersion` and `contractSchemaRef` are present on all successful dispatch results from the unified ingress.

## Deprecation map (legacy)

The following are **forbidden in production TypeScript** under `src/` (enforced by `npm run scan:legacy-dispatch-entrypoints`):

| Pattern | Replacement |
|--------|-------------|
| `new EveAdapter` / `new HermesAdapter` outside `src/bin/unified-dispatch.ts` | Use the unified dispatch CLI or shared runtime builder. |
| `dispatchUnifiedMessage` outside `src/runtime/unified-dispatch.ts` and `src/bin/unified-dispatch.ts` | Route all ingress through the unified entrypoint. |

**Scripts and docs** must not prescribe direct legacy shell bypasses (literal Eve dispatch script name, or `python -m hermes gateway`-style invocations). Harness scripts that invoke the unified dispatch binary are allowlisted in `scripts/scan-legacy-dispatch-entrypoints.sh`.

**Operator ingress:** use `npm run dispatch` with environment variables from `.env.example`, not ad-hoc lane binaries.

## Changelog

- **2026-04-28-h4-v1:** Initial stamped contract; adds `contractVersion`, `contractSchemaRef`, optional `primaryFallbackLimited`, and audit log propagation of contract fields.
