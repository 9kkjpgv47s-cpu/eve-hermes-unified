# Unified dispatch result contract (v1)

This document describes the **machine-readable** shape returned by `dispatchUnifiedMessage` and emitted by `npm run dispatch` (stdout JSON).

## Version

- Field **`contractVersion`**: must be exactly **`v1`** for this document.
- Consumers should reject unknown versions rather than guessing field semantics.

## Top-level shape (`UnifiedDispatchResult`)

| Field | Type | Notes |
|-------|------|--------|
| `contractVersion` | `"v1"` | Required. |
| `envelope` | object | Ingress message; see `UnifiedMessageEnvelope` in `src/contracts/types.ts`. |
| `routing` | object | `RoutingDecision`: primary/fallback lanes, reason, policy version, fail-closed. |
| `primaryState` | object | `DispatchState` for the primary lane attempt. |
| `fallbackState` | object? | Present when fallback ran. |
| `fallbackInfo` | object? | Metadata when fallback was attempted. |
| `capabilityDecision` | object? | Set when `@cap` path selected a capability. |
| `capabilityExecution` | object? | Capability engine outcome when applicable. |
| `response` | object | `UnifiedResponse`: user-facing summary, `failureClass`, `laneUsed`, `traceId`. |

## Validation

Runtime code validates every outbound result via **`validateUnifiedDispatchResult`** (`src/contracts/validate.ts`).

## Fixtures

Canonical examples live under **`test/fixtures/`** (e.g. `unified-dispatch-result-v1-primary-pass.json`). CI runs **`npm run validate:dispatch-contract`**, which executes `src/bin/validate-dispatch-contracts.ts` against every matching fixture.

## Upgrade path

When breaking the shape, introduce **`v2`**, keep **`v1`** fixtures and validation rules for one release window, and document migration in a successor file (e.g. `DISPATCH_CONTRACT_V2.md`).
