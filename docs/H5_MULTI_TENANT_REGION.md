# H5: Multi-tenant and multi-region dispatch

This document describes the first H5 slice: **tenant-scoped memory**, **tenant-scoped capability policy**, **region metadata and deterministic region-mismatch routing**, and **remediation dry-run manifests**.

## Tenant isolation

- **Envelope:** optional `tenantId` on `UnifiedMessageEnvelope` (set via `npm run dispatch -- --tenant-id <id>` or `UNIFIED_DISPATCH_TENANT_ID`).
- **Memory:** when `tenantId` is set on a `UnifiedMemoryKey`, the backing store uses a distinct storage key prefix so values do not collide across tenants. Legacy keys without `tenantId` behave as before.
- **Capabilities:** policy may restrict chats per tenant using semicolon-separated rules:
  - `UNIFIED_CAPABILITY_ALLOW_CHAT_IDS_BY_TENANT` — `tenant_a:1,2;tenant_b:3`
  - `UNIFIED_CAPABILITY_DENY_CHAT_IDS_BY_TENANT` — `tenant_a:99`
- **Strict mode:** `UNIFIED_TENANT_ISOLATION_STRICT=1` with strict preflight fails startup if no tenant id is resolved (CLI or env).

Machine check: `npm run validate:h5-tenant-isolation`.

## Region awareness and replay-safe failover

- **Envelope:** optional `regionId` (`--region-id` or `UNIFIED_DISPATCH_REGION_ID`).
- **Router:** optional `routerRegionId` from `UNIFIED_ROUTER_REGION_ID`; routing decisions include `dispatchRegionId`, `routerRegionId`, and `regionAligned`.
- **Mismatch:** when both regions are set and differ, `dispatchUnifiedMessage` uses `routeMessageWithRegionFailover`, which deterministically sets **primary** to the configured **fallback** lane and **fallback** to `none`, with reason `region_mismatch_failover_to_fallback_lane`.

## Remediation playbook dry-run

Bounded, no-op manifest for operators and cloud agents:

```bash
npm run run:remediation-playbook-dry-run
```

Writes `evidence/remediation-playbook-dry-run-*.json` with `dryRun: true` and `boundedPolicy` fields.
