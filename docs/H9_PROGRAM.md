# H9 program horizon (placeholder)

H9 is the **next runway** after the H8 release posture / soak SLO slice. The repository seeds **`horizonStates.H9`**, **`h9-action-*`** next actions, and **`H8->H9`** in `docs/GOAL_POLICIES.json` / `docs/HORIZON_STATUS.json`.

## Evidence chain from H8

- **`npm run validate:h8-evidence-bundle`** — same scale checks as prior slice bundles; writes **`evidence/h8-closeout-evidence-*.json`** with `closeout.horizon: "H8"`.
- **`npm run validate:h9-closeout`** — wraps the newest passing **`h8-closeout-evidence-*.json`** into **`evidence/h9-closeout-*.json`** (`schemaVersion: h9-closeout-v1`, **`closeout.horizon: H8`**, **`closeout.nextHorizon: H9`**) and requires the newest **`validation-summary-*.json`** to include passing **`sloPosture`** (`h8-slo-posture-v1`, **`horizonProgram: "H8"`**).
- **`npm run validate:h8-horizon-closeout`** — **`validate-horizon-closeout`** for **H8→H9** with **`--require-h8-evidence-bundle`**.
- **`npm run run:h8-closeout`** / **`npm run run:h8-promotion`** — orchestration hooks for H8→H9.

Both **`validate:h8-evidence-bundle`** and **`validate:h9-closeout`** run at the end of **`npm run validate:all`** (after **`validate:h8-closeout`**).

See **`docs/HORIZON_STATUS.json`** for **`h9-action-*`** and **`docs/H8_PROGRAM.md`** for the full ladder through H8.
