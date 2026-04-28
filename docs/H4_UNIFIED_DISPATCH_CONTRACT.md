# Unified dispatch contract (H4)

This document is the **human-readable companion** to the machine-enforced `UnifiedDispatchResult` shape produced by `dispatchUnifiedMessage` in `src/runtime/unified-dispatch.ts`.

## Current version

| Field | Value |
|-------|--------|
| `contractVersion` | `2026-04-28-h4-v1` (see `UNIFIED_DISPATCH_CONTRACT_VERSION` in `src/contracts/dispatch-contract.ts`) |
| `contractSchemaRef` | `docs/H4_UNIFIED_DISPATCH_CONTRACT.md` |

## Invariants (v1)

1. **Ingress**: Production traffic must enter through `npm run dispatch` / `src/bin/unified-dispatch.ts`, which calls `dispatchUnifiedMessage`. Direct `EveAdapter` / `HermesAdapter` construction outside that entrypoint is **deprecated** for production ingress (see `scripts/scan-legacy-dispatch-entrypoints.sh`).
2. **Envelope**: `traceId`, `channel` (`telegram`), `chatId`, `messageId`, `receivedAtIso`, and non-empty `text` are always present on `result.envelope`.
3. **Routing**: `routing` includes `primaryLane`, `fallbackLane` (`eve` \| `hermes` \| `none`), `reason`, `policyVersion`, and `failClosed`.
4. **Dispatch states**: `primaryState` (and optional `fallbackState`) satisfy `validateDispatchState` — including `failureClass` taxonomy and `traceId` alignment with the envelope.
5. **Response**: `response` includes `failureClass`, `laneUsed`, `traceId`, and human-readable `responseText`.
6. **Capability path**: When `@cap` handling runs, `capabilityDecision` and `capabilityExecution` are populated; routing uses `failClosed: true` and `fallbackLane: "none"` for that path.

## Upgrade notes

- When changing any of the above invariants, **bump** `UNIFIED_DISPATCH_CONTRACT_VERSION` in `src/contracts/dispatch-contract.ts` and extend this document.
- Downstream consumers should pin `contractVersion` in their integration tests or evidence validators.

## Deprecation map (legacy)

| Path / pattern | Status | Replacement |
|----------------|--------|----------------|
| Direct `new EveAdapter` / `new HermesAdapter` in application `src/` | **Deprecated** for ingress | `src/bin/unified-dispatch.ts` + `dispatchUnifiedMessage` |
| Direct shell calls to `eve-task-dispatch.sh` or Hermes gateway from operators | **Out of band** | `npm run dispatch` with env from `.env` / gateway env |

CI gate: `npm run scan:legacy-dispatch-entrypoints` (fails if forbidden patterns appear outside the allowlisted ingress file).
