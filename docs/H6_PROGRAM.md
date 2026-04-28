# H6 program horizon (federation and partition evidence)

H6 extends the unified dispatch program beyond tenant and region slices: **optional partition and federation-style correlation** so evidence (WAL, audit, soak summaries) stays attributable when multiple edges, cells, or operator-defined partitions share one repository.

## Goals (machine- and operator-facing)

1. **Correlation identifiers** — Optional `partitionId` (or equivalent) on envelopes and propagated through dispatch results, durable WAL, replay, and audit logs when present. Empty or unset values preserve current behavior.
2. **Evidence dimensions** — Soak and validation summaries can aggregate by `partitionId` alongside tenant and region, with the same drift and diversity alarms pattern as H5.
3. **Closeout and promotion** — `H5->H6` transition is gated by `goalPolicies` in `docs/GOAL_POLICIES.json` and mirrored in `docs/HORIZON_STATUS.json`. H6 closeout manifests will reuse the horizon-closeout schema family where applicable.
4. **Fail-closed defaults** — Any new fields remain optional; strict modes are env-gated and covered by preflight and tests like prior horizons.

## Relationship to H5

H5 closed multi-tenant memory, capability policy, region-aware routing, and the H5 evidence bundle gate (`npm run validate:h5-evidence-bundle`). H6 layers **partition-level** correlation for scale-out and multi-cell operations without weakening tenant or region isolation.
