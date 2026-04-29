# H7 program horizon (observability and SLO evidence)

H7 is the **observability and SLO evidence** runway after the H6 federation/partition slice. It does not change dispatch routing or tenant isolation; it **locks how operators prove** that the unified stack stays within posture using the same artifacts `validate:all` already produces.

## Goals (machine- and operator-facing)

1. **Evidence contracts** — Treat these artifacts as the canonical H7 posture surface (all emitted under `evidence/` when running `npm run validate:all`):
   - `validation-summary-*.json` — must include `soakDrillDimensions` with at least two non-`_none` keys each for **tenants**, **regions**, and **partitions** (same gate as `validate:h5-evidence-bundle` / `validate:h6-evidence-bundle` / `validate:h7-evidence-bundle`).
   - `h5-region-misalignment-drill-*.json` — `schemaVersion: h5-region-misalignment-drill-v2`, `pass: true`.
   - `h6-partition-drill-*.json` — `schemaVersion: h6-partition-drill-v1`, `pass: true`.
   - `emergency-rollback-rehearsal-*.json` — `dryRun: true`.
   - `remediation-playbook-dry-run-*.json` — `policyBounds.dryRunOnly: true`.

2. **H6 slice evidence bundle** — `npm run validate:h6-evidence-bundle` runs the same checks as the H5 bundle and writes **`h6-closeout-evidence-*.json`** with `closeout.horizon: "H6"` for pinning H6 operational completeness (independent of the H5→H6 promotion wrapper in `validate:h6-closeout`).

3. **H6→H7 closeout wrapper** — `npm run validate:h7-closeout` reads the newest passing **`h6-closeout-evidence-*.json`** and emits **`h7-closeout-*.json`** (`schemaVersion: h7-closeout-v1`, `closeout.horizon: "H6"`, `closeout.nextHorizon: "H7"`) for **`promote:horizon -- --horizon H6 --next-horizon H7 --closeout-file <path> --goal-policy-key H6->H7`**.

4. **Horizon closeout composition** — `npm run validate:h6-horizon-closeout` runs `validate-horizon-closeout.mjs` for **H6→H7** with **`--require-h6-evidence-bundle`** so required evidence and the H6 bundle gate compose in one manifest. **`npm run run:h6-closeout`** passes **`--require-h6-evidence-bundle`** to that script (and **`run:h5-closeout`** passes **`--require-h5-evidence-bundle`**).

5. **H7 slice evidence and H7→H8 (h7-action-3)** — **`npm run validate:h7-evidence-bundle`** writes **`h7-closeout-evidence-*.json`** (`closeout.horizon: "H7"`). **`npm run validate:h8-closeout`** wraps it into **`h8-closeout-*.json`** for **`promote:horizon … --goal-policy-key H7->H8`** and also requires the newest **`validation-summary-*.json`** to carry **`sloPosture`** (`h8-slo-posture-v1`, **`gatesPassed: true`**, **`horizonProgram` in `H8`|`H9`|`H10`**) from **`summarize-evidence`**. **`npm run validate:h7-horizon-closeout`** composes **H7→H8** with **`--require-h7-evidence-bundle`**. **`npm run run:h7-closeout`** passes **`--require-h7-evidence-bundle`**. **`validate:all`** continues through **H11** closeout (see **`docs/H9_PROGRAM.md`**, **`docs/H10_PROGRAM.md`**, **`docs/H11_PROGRAM.md`**).

See **`docs/HORIZON_STATUS.json`** for **`h7-action-*`** status, **`docs/H8_PROGRAM.md`** for the H8 program, **`docs/H9_PROGRAM.md`** for the H9 validate-all slice, **`docs/H10_PROGRAM.md`** for promotion-pin integrity, **`docs/H11_PROGRAM.md`** for the H11 placeholder, and **`docs/GOAL_POLICIES.json`** for **`H6->H7`**, **`H7->H8`**, **`H8->H9`**, **`H9->H10`**, and **`H10->H11`** transition policies.
