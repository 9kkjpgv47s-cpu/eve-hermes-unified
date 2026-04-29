# H6 program horizon (federation and partition evidence)

H6 extends the unified dispatch program beyond tenant and region slices: **optional partition and federation-style correlation** so evidence (WAL, audit, soak summaries) stays attributable when multiple edges, cells, or operator-defined partitions share one repository.

## Goals (machine- and operator-facing)

1. **Correlation identifiers** — Optional `partitionId` on envelopes and propagated through dispatch results, durable WAL, replay, and audit logs when present (implemented in h6-action-1). Empty or unset values preserve current behavior.
2. **Evidence dimensions** — Soak and validation summaries aggregate by `partitionId` alongside tenant and region, with the same drift and diversity alarms pattern as H5 (implemented in h6-action-2).
3. **Closeout and promotion** — `H5->H6` transition is gated by `goalPolicies` in `docs/GOAL_POLICIES.json` and mirrored in `docs/HORIZON_STATUS.json`. **`npm run validate:h6-closeout`** (after **`validate:h5-evidence-bundle`**) emits **`evidence/h6-closeout-*.json`** (`schemaVersion: h6-closeout-v1`, `closeout.horizon: H5`, `closeout.nextHorizon: H6`) wrapping the latest passing **`h5-closeout-*.json`**. Pin that file (or the underlying H5 manifest) on **`npm run promote:horizon -- --horizon H5 --next-horizon H6 --closeout-file <path> --goal-policy-key H5->H6`**; use **`--strict-goal-policy-gates`** when the full policy matrix must pass. Operator partition drill: **`npm run run:h6-partition-drill`** (manifest **`h6-partition-drill-v1`**, checked by **`validate:h5-evidence-bundle`**). **h6-action-5** advances **`docs/HORIZON_STATUS.json`** to **`activeHorizon: H6`**, marks **H5** `completed`, and seeds **H7** (`h7-action-*`, **`H6->H7`** policy); use **`npm run run:h6-promotion`** when orchestrating **H6→H7** after closeout evidence exists.

## H7 chain (h7-action-1..2)

After **`validate:h6-closeout`** (H5→H6 pin), **`validate:all`** runs **`validate:h6-evidence-bundle`** then **`validate:h7-closeout`**, then **`validate:h7-evidence-bundle`**, **`validate:h8-closeout`**, **`validate:h8-evidence-bundle`**, and **`validate:h9-closeout`**. See **`docs/H7_PROGRAM.md`**, **`docs/H8_PROGRAM.md`**, and **`docs/H9_PROGRAM.md`**.

4. **Fail-closed defaults** — Any new fields remain optional; strict modes are env-gated and covered by preflight and tests like prior horizons.

## H6 closeout manifest (h6-action-4)

1. Run **`npm run validate:all`** (or at minimum the H5 evidence chain ending with **`validate:h5-evidence-bundle`**).
2. Run **`npm run validate:h6-closeout`** — produces **`h6-closeout-<timestamp>.json`** under **`evidence/`** if the latest **`h5-closeout-*.json`** passed and **`horizonCloseoutGatePass`** is true.
3. Promote (dry-run first): **`npm run promote:horizon -- --horizon H5 --next-horizon H6 --horizon-status-file docs/HORIZON_STATUS.json --evidence-dir evidence --closeout-file evidence/h6-closeout-<...>.json --goal-policy-key H5->H6 --dry-run`**

The H6 manifest embeds **`upstream`** (path and checks from the H5 bundle) for audit replay.

## Relationship to H5

H5 closed multi-tenant memory, capability policy, region-aware routing, and the H5 evidence bundle gate (`npm run validate:h5-evidence-bundle`). H6 layers **partition-level** correlation for scale-out and multi-cell operations without weakening tenant or region isolation.
