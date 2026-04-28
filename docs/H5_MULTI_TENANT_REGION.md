# H5 — Multi-tenant memory, region-aware routing, and remediation dry-runs

This document describes the in-repo H5 slice for scale-oriented unified dispatch. It complements `docs/NEXT_LONG_HORIZON_ACTION_PLAN.md` (H5 section) with concrete env vars and commands.

## Envelope fields

- `tenantId` (optional): scopes unified memory keys and participates in capability policy when per-tenant maps are configured. Omitted tenants use the legacy key space (no `tenant:` prefix) for backward compatibility.
- `regionId` (optional): compared with `UNIFIED_ROUTER_REGION_ID` for alignment. When both are set and differ, the router deterministically swaps primary and fallback lanes before dispatch (see `mergeRegionRouting` / `routeMessage` in `src/router/policy-router.ts`).

Defaults from environment apply when the CLI omits flags:

- `UNIFIED_DISPATCH_DEFAULT_TENANT_ID` (aliases: `UNIFIED_DISPATCH_TENANT_ID`)
- `UNIFIED_DISPATCH_DEFAULT_REGION_ID` (aliases: `UNIFIED_DISPATCH_REGION_ID`)

## CLI

`unified-dispatch` accepts:

- `--tenant-id <id>`
- `--region-id <id>`

The durable WAL `dispatch_attempt` record includes `tenantId` and `regionId` when present. `npm run replay:dispatch-wal` replays orphans with the same fields so replay stays consistent with the original attempt.

## Capability policy

Global per-capability chat allow/deny maps remain unchanged (`UNIFIED_CAPABILITY_PER_CAPABILITY_CHAT_ALLOWLIST` / `DENYLIST`).

Per-tenant maps use semicolon-separated rules of the form `tenant_id/capability_id:chat1,chat2`:

- `UNIFIED_CAPABILITY_ALLOW_CHAT_IDS_BY_TENANT`
- `UNIFIED_CAPABILITY_DENY_CHAT_IDS_BY_TENANT`

Tenant ids in policy maps are normalized to lower case.

## Strict tenant isolation

When `UNIFIED_TENANT_ISOLATION_STRICT=1`, runtime preflight requires a non-empty effective tenant id (from `--tenant-id` or `UNIFIED_DISPATCH_DEFAULT_TENANT_ID`). Use this in environments where every dispatch must be tenant-attributed.

## Validation commands

- `npm run validate:h5-tenant-isolation` — lightweight invariant check for tenant storage key separation.
- `npm run run:remediation-playbook-dry-run` — writes `evidence/remediation-playbook-dry-run-*.json` (dry-run only; suggests bounded operator commands).

Both run as part of `npm run validate:all`.

## Follow-on (planned in `docs/HORIZON_STATUS.json`)

- Richer soak/evidence dimensions for tenant and region (`h5-action-4`).
- Optional tenant-scoped audit partitioning (`h5-action-5`).
