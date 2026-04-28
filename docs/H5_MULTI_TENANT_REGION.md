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

The durable WAL `dispatch_attempt` record includes `tenantId` and `regionId` when present. `dispatch_complete` lines include the same tenant/region when present, plus **`envelopeRegionId`**, **`routerRegionId`**, and **`regionAligned`** for correlation with routing decisions. `npm run replay:dispatch-wal` replays orphans with the same fields so replay stays consistent with the original attempt.

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

## H5 evidence bundle gate (h5-action-9)

After a full `validate:all` (or equivalent evidence generation), the bundle check runs as:

```bash
npm run validate:h5-evidence-bundle
```

This selects the newest `validation-summary-*.json`, `h5-region-misalignment-drill-*.json`, `emergency-rollback-rehearsal-*.json`, and `remediation-playbook-dry-run-*.json` under `evidence/`, checks soak tenant/region drill diversity (≥2 non-`_none` keys each), and writes `evidence/h5-closeout-*.json` as a **`horizon-closeout`** manifest (`checks.horizonCloseoutGatePass`).

Full **H5 horizon closeout** (required global evidence plus the bundle above) uses `npm run validate:h5-closeout`, which runs `validate-horizon-closeout.mjs` for `--horizon H5 --next-horizon H6` with `--require-h5-evidence-bundle` so the evidence bundle gate runs in the same process as standard closeout checks. Operators may pin the emitted manifest for **`npm run promote:horizon`** when marking H5 completed per `docs/CLOUD_AGENT_HANDOFF.md` and local promotion policy.

## Region misalignment operator drill (h5-action-6)

The third scenario (`@hermes`) temporarily sets **`UNIFIED_ROUTER_DEFAULT_FALLBACK=eve`** so primary and fallback differ (swap is otherwise a no-op when both lanes would be `hermes`).

## Soak drill dimensions

`scripts/soak-simulate.sh` cycles `--tenant-id` / `--region-id` across iterations so `npm run summarize:soak` can emit `drillDimensions` (tenant counts, region counts, `routing.regionAligned` histogram) and optional drift alarms for low tenant/region diversity.

`scripts/summarize-evidence.mjs` includes the same aggregates under `soakDrillDimensions` in the validation summary output.

## Dispatch audit retention hooks

When `UNIFIED_DISPATCH_AUDIT_TENANT_PARTITION=1`, each dispatch with a non-empty `envelope.tenantId` appends to a sibling file `basename.tenant-<sanitized>.jsonl` next to `UNIFIED_DISPATCH_AUDIT_LOG_PATH` (legacy path still receives dispatches without `tenantId`).

When `UNIFIED_DISPATCH_AUDIT_MAX_BYTES_BEFORE_ROTATE` is set to a positive byte threshold, the active audit file is renamed to `*.rotated-<iso-stamp>` before the next append if it would exceed the limit.

## Prior follow-on items

These are now implemented in-repo; see `docs/HORIZON_STATUS.json` for any newer runway actions.
