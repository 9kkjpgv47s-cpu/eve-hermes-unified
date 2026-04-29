# H10 program horizon (promotion-pin integrity)

H10 is the **H9→H10 promotion pin integrity** slice: it proves the **`h10-closeout-*.json`** artifact (from **`npm run validate:h10-closeout`**) is present, passing, and schema-valid **together with** the same **scale + SLO** surface the prior horizons already gate—so operators cannot advance to **H10→H11** on stale or partial evidence.

## Goals

1. **`validate:h10-closeout`** — Wraps newest **`h9-closeout-evidence-*.json`** and requires:
   - newest **`validation-summary-*.json`** with **`sloPosture`** (`h8-slo-posture-v1`, **`gatesPassed: true`**, **`horizonProgram: "H10"`**)
   - newest **`validate-all-chain-posture-*.json`** (default prefix) with **`gatesPassed: true`**, **`horizonProgram: "H10"`**, schema **`h9-validate-all-chain-v1`**

2. **`summarize-evidence.mjs`** — Emits **`sloPosture.horizonProgram: "H10"`** on **`validation-summary-*.json`** so **H8→H9**, **H9→H10**, and **H10** gates align on one SLO stamp for the active program slice.

3. **`validate:h10-evidence-bundle` (h10-action-2)** — After **`validate:h10-closeout`**, **`validate:all`** runs **`npm run emit:validate-all-chain-posture-h11`** then **`validate:h10-evidence-bundle`**, which:
   - Re-runs **scale bundle** checks (soak drill dimensions, region drill, partition drill, rollback rehearsal, remediation dry-run)
   - Requires the newest **`h10-closeout-*.json`** (promotion pin, **not** `h10-closeout-evidence-*`) with **`schemaVersion: h10-closeout-v1`**, **`pass: true`**, **`closeout.horizon: "H9"`**, **`closeout.nextHorizon: "H10"`**
   - Emits **`h10-closeout-evidence-*.json`** with **`closeout.horizon: "H10"`** for **`validate:h11-closeout`**

4. **`validate:h11-closeout`** — Wraps **`h10-closeout-evidence-*.json`** and requires **`validate-all-chain-posture-h11-*.json`** with **`horizonProgram: "H11"`** (second tail snapshot for **H10→H11** promotion).

5. **Horizon closeout** — **`npm run validate:h10-horizon-closeout`** composes **H10→H11** with **`--require-h10-evidence-bundle`**. **`npm run run:h10-closeout`** passes that flag into **`validate-horizon-closeout`**.

See **`docs/HORIZON_STATUS.json`** for **`h10-action-*`**, **`docs/H11_PROGRAM.md`** for the H11 placeholder, and **`docs/GOAL_POLICIES.json`** for **`H9->H10`** and **`H10->H11`**.
