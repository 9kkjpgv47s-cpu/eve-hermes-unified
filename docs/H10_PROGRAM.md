# H10 program horizon (placeholder)

H10 is the **next runway** after the H9 validate-all completion slice. The repository seeds **`horizonStates.H10`**, **`h10-action-*`** next actions, and **`H9->H10`** in `docs/GOAL_POLICIES.json` / `docs/HORIZON_STATUS.json`.

## Evidence chain from H9

- **`npm run validate:h9-evidence-bundle`** — same scale checks as prior slice bundles; writes **`evidence/h9-closeout-evidence-*.json`** with `closeout.horizon: "H9"`.
- **`npm run emit:validate-all-chain-posture`** — writes **`validate-all-chain-posture-*.json`** (`h9-validate-all-chain-v1`) with **`horizonProgram: "H10"`** when invoked from **`validate:all`** (proves h9-closeout + regression + cutover + SLO gates).
- **`npm run validate:h10-closeout`** — wraps the newest passing **`h9-closeout-evidence-*.json`** and requires the newest **`validate-all-chain-posture-*.json`** with **`gatesPassed: true`** and **`horizonProgram: "H10"`**. Emits **`h10-closeout-*.json`** (`h10-closeout-v1`) for **`promote:horizon … --goal-policy-key H9->H10`**.
- **`npm run validate:h9-horizon-closeout`** — **`validate-horizon-closeout`** for **H9→H10** with **`--require-h9-evidence-bundle`**.
- **`npm run run:h9-closeout`** / **`npm run run:h9-promotion`** — orchestration hooks for H9→H10.

See **`docs/H9_PROGRAM.md`** for the full ladder through H9 and **`docs/HORIZON_STATUS.json`** for **`h10-action-*`**.
