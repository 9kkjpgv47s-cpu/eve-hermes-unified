# H8 program horizon (release posture and soak SLO evidence)

H8 is the **release posture and soak SLO evidence** slice: it ties **operator-visible promotion evidence** to the same soak + failure-injection signals `validate:all` already runs, without changing routing or tenant isolation.

## Goals (machine- and operator-facing)

1. **`sloPosture` on `validation-summary-*.json`** — `npm run validate:evidence-summary` (via `scripts/summarize-evidence.mjs`) adds **`sloPosture`** with:
   - **`schemaVersion: "h8-slo-posture-v1"`**
   - **`metrics`** — `successRate`, `missingTraceRate`, `unclassifiedFailures`, `p95LatencyMs`, `latencySampleCount`, `failureScenarioPassCount`, `totalRecords`
   - **`evidenceGates`** — thresholds used for the run (`minSuccessRate`, `maxMissingTraceRate`, `maxUnclassifiedFailures`, `maxP95LatencyMs`, `requireFailureScenarios`)
   - **`gatesPassed`** — boolean mirror of the existing top-level **`gates.passed`** (must be **true** for H8 closeout)

2. **`validate:h8-closeout` composition** — After a passing **`h7-closeout-evidence-*.json`**, **`npm run validate:h8-closeout`** also reads the **newest** **`validation-summary-*.json`** in `evidence/` and requires **`sloPosture`** with **`gatesPassed: true`**. This pins **H7→H8** promotion to both the scale bundle **and** the soak SLO snapshot from the same `validate:all` run.

3. **Horizon closeout** — **`npm run validate:h7-horizon-closeout`** still composes **H7→H8** with **`--require-h7-evidence-bundle`**. **`npm run run:h7-closeout`** passes **`--require-h7-evidence-bundle`** into `validate-horizon-closeout`.

4. **Optional next step (h8-action-3)** — After **`promote:horizon`** marks H7 completed in your environment, set **`activeHorizon`** to **H8** and seed **H9** or product-specific **`nextActions`** when scope is ready.

See **`docs/HORIZON_STATUS.json`** for **`h8-action-*`** and **`docs/GOAL_POLICIES.json`** for **`H7->H8`**.
