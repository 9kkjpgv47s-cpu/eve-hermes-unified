# H7 program horizon (placeholder)

H7 is the **next runway** after the H6 federation/partition evidence slice. This repository seeds **`horizonStates.H7`**, **`h7-action-*`** next actions, and **`H6->H7`** in `docs/GOAL_POLICIES.json` / `docs/HORIZON_STATUS.json` so promotion tooling can reason about the transition before product scope locks.

## Likely themes (to refine when scope is ready)

- **Observability and SLO contracts** — tie `validate:all` and soak summaries to explicit SLO budgets and alerting hooks.
- **Cross-horizon evidence** — extend closeout manifests for **H6→H7** the same way **H5→H6** uses `validate:h6-closeout`.

## Current machine gates

- **`H6->H7`** exists in goal policy files for **`promote:horizon`** when using **`--goal-policy-key H6->H7`** (after H7 actions are implemented and evidenced).
- **`npm run validate:goal-policy-file`** defaults to **`--until-horizon H7`** so CI validates the full transition ladder through H6→H7.

See **`docs/HORIZON_STATUS.json`** for **`h7-action-1`** and **`h7-action-2`**.
