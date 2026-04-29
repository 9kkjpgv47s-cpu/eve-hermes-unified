# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- **Active horizon:** `H19` **completed** per `docs/HORIZON_STATUS.json` (terminal: **`run:h19-assurance-bundle`** = **`run:h18-assurance-bundle`** + **`validate-horizon-status`** on `docs/HORIZON_STATUS.json`; **H18** = **H17** + prune rehearsal; **H17** = **H16** + **`verify:evidence-prune`**).
- **H5 evidence retention (h5-action-10):** `scripts/prune-evidence.mjs` with `npm run prune:evidence` / `npm run verify:evidence-prune`, manifest type **`evidence-prune-run`**, **`h5-evidence-baseline.mjs`** embeds prune **dry-run** and requires **`checks.evidencePruneDryRunPass`**. **`run-h5-closeout-evidence.mjs`** chains remediation playbook + baseline so H5 closeout evidence carries the same signals.
- **Post-H16 sustainment:** `npm run verify:sustainment-loop` runs **`validate:horizon-status`** + **`run:h19-assurance-bundle`** + **`validate:evidence-volume`** (writes `evidence/post-h16-sustainment-loop-*.json`). Closeout gates (**`validate:h17-closeout`** … **`validate:h19-closeout`**) consume this manifest and must **not** be nested inside the loop.
- **Goal policy window:** `npm run validate:goal-policy-file` defaults to **H2→H19** (`package.json`).
- **CI:** `unified-ci` runs advisory **`verify:evidence-prune`** (TTL `0`), **`bundle:h4-closeout-evidence`**, **`bundle:h5-evidence-baseline`**, then **release-readiness** with **`UNIFIED_RELEASE_READINESS_REQUIRE_H5_BASELINE=1`** when configured in `validate-release-readiness.sh`.

## What Was Just Completed (this chunk)

1. **H19:** `run-h19-assurance-bundle.mjs`; **`package.json`**: **`run:h19-assurance-bundle`**, **`validate:h19-closeout`**, **`validate:goal-policy-file`** **`--until-horizon H19`**; **`run-h16-assurance-bundle`** goal-policy **H19**; **`run-post-h16-sustainment-loop`** runs **`run:h19-assurance-bundle`**.
2. **`GOAL_POLICIES.json` / `HORIZON_STATUS.json`:** **`H18->H19`**; required evidence for **H19**; **`h19-action-*`** completed; **`goalPolicies`** in status includes **H18->H19**.
3. **Sequences:** **`H19`** on **`HORIZON_SEQUENCE`** / **`VALID_HORIZONS`**; **`validate-horizon-status.mjs`** goal-policy regex **H1–H19**; **`evaluate-auto-rollback-policy`** stage **full** for **H19**; **`validate-horizon-closeout`** **`h19-assurance-bundle`** verification + stage-promotion skip for **H19**.
4. **`check-progressive-horizon-goals.mjs`:** terminal skip when active horizon is **H19** (last in sequence).
5. **Tests:** **`horizonStates.H19`** in fixtures; duplicate-key JSON test includes **H19**.

## Read Order

1. `README.md` → `AGENTS.md` → `AGENT.md` → `docs/CLOUD_AGENT_HANDOFF.md` → `docs/HORIZON_STATUS.json`

## Immediate Next Targets

1. **H20** runway (same pattern: extend sequences, **`H19->H20`** in policies, optional **`run-h20-assurance-bundle`**, bump **`--until-horizon`**, point sustainment at new terminal if desired).
2. **`npm run validate:h19-closeout`** after evidence changes affecting H19 required artifacts.
3. **`npm run verify:sustainment-loop`** after changing assurance or volume scripts.

## Validation Pack

```bash
npm run validate:horizon-status
npm run check && npm test
npm run validate:all
```

## Delivery Checklist

- Implement + tests + docs; commit, push, PR.
