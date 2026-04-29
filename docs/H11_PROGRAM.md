# H11 program horizon (dual-tail validate-all chain integrity)

H11 is the **second validate-all chain posture** slice after H10 promotion-pin integrity. It proves operators carry **two** independent chain posture snapshots in one `validate:all` run: the original tail pinned on **`h9-closeout-*.json`** (`horizonProgram: "H10"`) and a **second** tail pinned on the **`h11-closeout-*.json`** promotion artifact (`horizonProgram: "H11"`, file prefix **`validate-all-chain-posture-h11-`**), while **`validation-summary.sloPosture.horizonProgram`** is stamped **`"H11"`** for the H10→H11 closeout gate.

## Goals

1. **`summarize-evidence.mjs`** — Emits **`sloPosture.horizonProgram: "H11"`** by default (override with **`--slo-horizon-program`** or **`UNIFIED_EVIDENCE_SLO_HORIZON_PROGRAM`**).

2. **`validate:h10-closeout`** — Still wraps **`h9-closeout-evidence-*.json`** and the default-prefix **`validate-all-chain-posture-*.json`** with **`horizonProgram: "H10"`**, but accepts **`sloPosture.horizonProgram`** as **`"H10"`** or **`"H11"`** so one early summary can satisfy both H9→H10 and H10→H11 gates during the same CI run.

3. **`validate:h11-closeout`** — Wraps **`h10-closeout-evidence-*.json`** and requires:
   - newest **`validation-summary-*.json`** with **`sloPosture`** (`h8-slo-posture-v1`, **`gatesPassed: true`**, **`horizonProgram: "H11"`**)
   - newest **`validate-all-chain-posture-h11-*.json`** with **`gatesPassed: true`**, **`horizonProgram: "H11"`**, schema **`h9-validate-all-chain-v1`** (upstream pin: **`h11-closeout-*.json`** via **`emit:validate-all-chain-posture-h11`** **`--promotion-closeout-prefix h11-closeout-`**)

4. **`emit:validate-all-chain-posture-h11`** — Second tail emit: **`--file-prefix validate-all-chain-posture-h11-`**, **`--horizon-program H11`**, **`--promotion-closeout-prefix h11-closeout-`**.

5. **`emit:validate-all-chain-posture-h12`** — Third tail emit for **H11→H12**: **`--file-prefix validate-all-chain-posture-h12-`**, **`--horizon-program H12`**, same **`h11-closeout-`** promotion pin as upstream.

6. **`validate:h11-evidence-bundle`** — After **`validate:h11-closeout`**, **`validate:all`** runs this gate: scale checks plus newest passing **`h11-closeout-*.json`** (not **`h11-closeout-evidence-*`**); emits **`h11-closeout-evidence-*.json`**.

7. **`validate:h12-closeout`** — Wraps **`h11-closeout-evidence-*.json`** and requires **`validate-all-chain-posture-h12-*.json`** with **`horizonProgram: "H12"`** plus **`sloPosture.horizonProgram: "H11"`** on the newest validation summary.

8. **Horizon closeout** — **`npm run validate:h11-horizon-closeout`** composes **H11→H12** with **`--require-h11-evidence-bundle`**. **`npm run run:h11-closeout`** passes that flag into **`validate-horizon-closeout`**.

See **`docs/HORIZON_STATUS.json`** for **`h11-action-*`**, **`docs/H12_PROGRAM.md`** for the H12 placeholder, and **`docs/GOAL_POLICIES.json`** for **`H10->H11`** and **`H11->H12`**.
