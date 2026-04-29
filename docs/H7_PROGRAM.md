# H7 program horizon (observability and SLO evidence)

H7 is the **observability and SLO evidence** runway after the H6 federation/partition slice. It does not change dispatch routing or tenant isolation; it **locks how operators prove** that the unified stack stays within posture using the same artifacts `validate:all` already produces.

## Goals (machine- and operator-facing)

1. **Evidence contracts** — Treat these artifacts as the canonical H7 posture surface (all emitted under `evidence/` when running `npm run validate:all`):
   - `validation-summary-*.json` — must include `soakDrillDimensions` with at least two non-`_none` keys each for **tenants**, **regions**, and **partitions** (same gate as `validate:h5-evidence-bundle` / `validate:h6-evidence-bundle`).
   - `h5-region-misalignment-drill-*.json` — `schemaVersion: h5-region-misalignment-drill-v2`, `pass: true`.
   - `h6-partition-drill-*.json` — `schemaVersion: h6-partition-drill-v1`, `pass: true`.
   - `emergency-rollback-rehearsal-*.json` — `dryRun: true`.
   - `remediation-playbook-dry-run-*.json` — `policyBounds.dryRunOnly: true`.

2. **H6 slice evidence bundle** — `npm run validate:h6-evidence-bundle` runs the same checks as the H5 bundle and writes **`h6-closeout-evidence-*.json`** with `closeout.horizon: "H6"` for pinning H6 operational completeness (independent of the H5→H6 promotion wrapper in `validate:h6-closeout`).

3. **H6→H7 closeout wrapper** — `npm run validate:h7-closeout` reads the newest passing **`h6-closeout-evidence-*.json`** and emits **`h7-closeout-*.json`** (`schemaVersion: h7-closeout-v1`, `closeout.horizon: "H6"`, `closeout.nextHorizon: "H7"`) for **`promote:horizon -- --horizon H6 --next-horizon H7 --closeout-file <path> --goal-policy-key H6->H7`**.

4. **Horizon closeout composition** — `npm run validate:h6-horizon-closeout` runs `validate-horizon-closeout.mjs` for **H6→H7** with **`--require-h6-evidence-bundle`** so required evidence and the H6 bundle gate compose in one manifest. **`npm run run:h6-closeout`** passes **`--require-h6-evidence-bundle`** to that script (and **`run:h5-closeout`** passes **`--require-h5-evidence-bundle`**).

5. **Optional next step (h7-action-3)** — After **`promote:horizon`** marks H6 completed in your environment, set **`activeHorizon`** to **H7** and seed **H8** or product-specific **`nextActions`** when scope is ready.

See **`docs/HORIZON_STATUS.json`** for **`h7-action-*`** status and **`docs/GOAL_POLICIES.json`** for **`H6->H7`** transition policy.
