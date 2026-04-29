# H9 program horizon (validate-all completion posture)

H9 is the **end-to-end `validate:all` completion** slice: it proves the repository’s unified gate chain finished with **scale evidence**, **SLO posture** on **`validation-summary-*.json`** (`sloPosture.horizonProgram: "H10"` or **`"H11"`** from **`summarize-evidence`** for the rolling H9→H10 / H10→H11 promotion window), **H8→H9 closeout**, **Eve-primary regression**, and **cutover readiness** in one coherent artifact.

## Goals

1. **Pinned evidence chain** — Same ladder as H8, plus an explicit tail:
   - **`npm run validate:h8-evidence-bundle`** → **`h8-closeout-evidence-*.json`**
   - **`npm run validate:h9-closeout`** → **`h9-closeout-*.json`** (requires newest **`validation-summary-*.json`** with **`sloPosture.gatesPassed: true`**, schema **`h8-slo-posture-v1`**, **`sloPosture.horizonProgram: "H10"`** or **`"H11"`**)
   - **`npm run validate:regression-eve`** → **`regression-eve-primary-*.json`** with **`pass: true`**
   - **`npm run validate:cutover-readiness`** → **`cutover-readiness-*.json`** with **`pass: true`**

2. **`validate-all-chain-posture` manifest** — **`npm run emit:validate-all-chain-posture`** runs in **`validate:all`** (after regression + cutover). It writes **`evidence/validate-all-chain-posture-*.json`** with:
   - **`schemaVersion: "h9-validate-all-chain-v1"`**
   - **`horizonProgram: "H10"`** (first tail snapshot for **`validate:h10-closeout`**)
   - **`gatesPassed`** — true only when the newest **`h9-closeout-*`** (promotion pin, not **`h9-closeout-evidence-*`**), **`regression-eve-primary-*`**, **`cutover-readiness-*`**, and **`validation-summary-*`** (SLO gates) all pass together

3. **H9→H10 runway (h9-action-3)** — **`npm run validate:h9-evidence-bundle`** and **`npm run validate:h10-closeout`** extend **`validate:all`** after the first chain posture. **`npm run validate:h9-horizon-closeout`** composes **H9→H10** with **`--require-h9-evidence-bundle`**. **`npm run run:h9-closeout`** passes that flag into **`validate-horizon-closeout`**.

4. **H10→H11→H12 continuation** — After **`validate:h10-closeout`**, **`validate:all`** runs **`emit:validate-all-chain-posture-h11`**, **`validate:h10-evidence-bundle`**, **`validate:h11-closeout`**, **`emit:validate-all-chain-posture-h12`**, **`validate:h11-evidence-bundle`**, and **`validate:h12-closeout`** (see **`docs/H10_PROGRAM.md`**, **`docs/H11_PROGRAM.md`**, **`docs/H12_PROGRAM.md`**).

5. **Promotion** — Pin **`h9-closeout-*.json`** on **`promote:horizon … --horizon H8 --next-horizon H9 --goal-policy-key H8->H9`**. Pin **`h10-closeout-*.json`** for **H9→H10** with **`--goal-policy-key H9->H10`**.

See **`docs/HORIZON_STATUS.json`** for **`h9-action-*`**, **`docs/H8_PROGRAM.md`** for SLO posture details, **`docs/H10_PROGRAM.md`** for the H10 promotion-pin slice, **`docs/H11_PROGRAM.md`** for the H11 dual-tail chain slice, **`docs/H12_PROGRAM.md`** for the H12 placeholder, and **`docs/GOAL_POLICIES.json`** for **`H8->H9`**, **`H9->H10`**, **`H10->H11`**, and **`H11->H12`**.
