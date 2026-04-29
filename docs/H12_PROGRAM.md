# H12 program horizon (placeholder)

H12 is the **next runway** after the H11 dual-tail validate-all chain integrity slice. The repository seeds **`horizonStates.H12`**, **`h12-action-*`** next actions, and **`H11->H12`** in `docs/GOAL_POLICIES.json` / `docs/HORIZON_STATUS.json`.

## Evidence chain from H11

- **`npm run validate:h11-evidence-bundle`** — scale checks plus newest **`h11-closeout-*.json`** (H10→H11 promotion pin); writes **`h11-closeout-evidence-*.json`** with `closeout.horizon: "H11"`.
- **`npm run validate:h12-closeout`** — wraps newest **`h11-closeout-evidence-*.json`**, requires newest **`validation-summary-*.json`** with **`sloPosture.horizonProgram: "H11"`** and passing gates, and newest **`validate-all-chain-posture-h12-*.json`** with **`gatesPassed: true`** and **`horizonProgram: "H12"`**. Emits **`h12-closeout-*.json`** (`h12-closeout-v1`) for **`promote:horizon … --goal-policy-key H11->H12`**.
- **`npm run validate:h11-horizon-closeout`** — **`validate-horizon-closeout`** for **H11→H12** with **`--require-h11-evidence-bundle`**.
- **`npm run run:h11-closeout`** / **`npm run run:h11-promotion`** — orchestration hooks for H11→H12.

See **`docs/H11_PROGRAM.md`** and **`docs/H10_PROGRAM.md`** for the full ladder.
