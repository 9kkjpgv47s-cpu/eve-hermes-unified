# H11 program horizon (placeholder)

H11 is the **next runway** after the H10 promotion-pin integrity slice. The repository seeds **`horizonStates.H11`**, **`h11-action-*`** next actions, and **`H10->H11`** in `docs/GOAL_POLICIES.json` / `docs/HORIZON_STATUS.json`.

## Evidence chain from H10

- **`npm run validate:h10-evidence-bundle`** — scale checks plus newest **`h10-closeout-*.json`** (H9→H10 promotion pin, not **`h10-closeout-evidence-*`**); writes **`h10-closeout-evidence-*.json`** with `closeout.horizon: "H10"`.
- **`npm run emit:validate-all-chain-posture-h11`** — same tail composition as the first emit, filename prefix **`validate-all-chain-posture-h11-`**, **`horizonProgram: "H11"`**.
- **`npm run validate:h11-closeout`** — wraps newest **`h10-closeout-evidence-*.json`** and requires newest **`validate-all-chain-posture-h11-*.json`** with **`gatesPassed: true`** and **`horizonProgram: "H11"`**. Emits **`h11-closeout-*.json`** (`h11-closeout-v1`) for **`promote:horizon … --goal-policy-key H10->H11`**.
- **`npm run validate:h10-horizon-closeout`** — **`validate-horizon-closeout`** for **H10→H11** with **`--require-h10-evidence-bundle`**.
- **`npm run run:h10-closeout`** / **`npm run run:h10-promotion`** — orchestration hooks for H10→H11.

See **`docs/H10_PROGRAM.md`** and **`docs/H9_PROGRAM.md`** for the full ladder.
