# H9 program horizon (validate-all completion posture)

H9 is the **end-to-end `validate:all` completion** slice: it proves the repository’s unified gate chain finished with **scale evidence**, **SLO posture**, **H8→H9 closeout**, **Eve-primary regression**, and **cutover readiness** in one coherent artifact.

## Goals

1. **Pinned evidence chain** — Same ladder as H8, plus an explicit tail:
   - **`npm run validate:h8-evidence-bundle`** → **`h8-closeout-evidence-*.json`**
   - **`npm run validate:h9-closeout`** → **`h9-closeout-*.json`** (requires newest **`validation-summary-*.json`** with **`sloPosture.gatesPassed: true`**, schema **`h8-slo-posture-v1`**)
   - **`npm run validate:regression-eve`** → **`regression-eve-primary-*.json`** with **`pass: true`**
   - **`npm run validate:cutover-readiness`** → **`cutover-readiness-*.json`** with **`pass: true`**

2. **`validate-all-chain-posture` manifest (h9-action-2)** — **`npm run emit:validate-all-chain-posture`** runs automatically at the end of **`npm run validate:all`**. It writes **`evidence/validate-all-chain-posture-*.json`** with:
   - **`schemaVersion: "h9-validate-all-chain-v1"`**
   - **`horizonProgram: "H9"`**
   - **`gatesPassed`** — true only when the newest **`h9-closeout-*`**, **`regression-eve-primary-*`**, **`cutover-readiness-*`**, and **`validation-summary-*`** (SLO gates) all pass together

3. **Horizon closeout** — **`npm run validate:h8-horizon-closeout`** composes **H8→H9** with **`--require-h8-evidence-bundle`**. **`npm run run:h8-closeout`** passes that flag into **`validate-horizon-closeout`**.

4. **Promotion** — Pin **`h9-closeout-*.json`** on **`promote:horizon … --horizon H8 --next-horizon H9 --goal-policy-key H8->H9`**. After promotion in your environment, advance **`activeHorizon`** to **H9** when you are ready to treat this slice as the live program horizon.

See **`docs/HORIZON_STATUS.json`** for **`h9-action-*`**, **`docs/H8_PROGRAM.md`** for SLO posture details, and **`docs/GOAL_POLICIES.json`** for **`H8->H9`**.
