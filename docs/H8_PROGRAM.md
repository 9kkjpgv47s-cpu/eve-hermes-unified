# H8 program horizon (placeholder)

H8 is the **next runway** after the H7 observability/SLO evidence slice. The repository seeds **`horizonStates.H8`**, **`h8-action-*`** next actions, and **`H7->H8`** in `docs/GOAL_POLICIES.json` / `docs/HORIZON_STATUS.json`.

## Evidence chain from H7

- **`npm run validate:h7-evidence-bundle`** — same scale checks as H5/H6/H7 slice bundles; writes **`evidence/h7-closeout-evidence-*.json`** with `closeout.horizon: "H7"`.
- **`npm run validate:h8-closeout`** — wraps the newest passing **`h7-closeout-evidence-*.json`** into **`evidence/h8-closeout-*.json`** (`schemaVersion: h8-closeout-v1`, **`closeout.horizon: H7`**, **`closeout.nextHorizon: H8`**) for **`promote:horizon … --goal-policy-key H7->H8`**.
- **`npm run validate:h7-horizon-closeout`** — **`validate-horizon-closeout`** for **H7→H8** with **`--require-h7-evidence-bundle`**.
- **`npm run run:h7-closeout`** / **`npm run run:h7-promotion`** — orchestration hooks for H7→H8 (same pattern as H6).

Both **`validate:h7-evidence-bundle`** and **`validate:h8-closeout`** run at the end of **`npm run validate:all`** (after **`validate:h7-closeout`**).

See **`docs/HORIZON_STATUS.json`** for **`h8-action-*`** and **`docs/H7_PROGRAM.md`** for the full H6/H7/H8 closeout ladder.
