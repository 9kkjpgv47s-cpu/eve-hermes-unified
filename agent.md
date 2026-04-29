# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- **Active horizon:** `H20` **completed** per `docs/HORIZON_STATUS.json` (terminal: **`run:h20-assurance-bundle`** = **`run:h19-assurance-bundle`** + **`npm run validate:manifest-schemas`**; **H19** = **H18** + horizon-status recheck; chain continues through **H16**).
- **H5 evidence retention (h5-action-10):** `scripts/prune-evidence.mjs` with `npm run prune:evidence` / `npm run verify:evidence-prune`, manifest type **`evidence-prune-run`**, **`h5-evidence-baseline.mjs`** embeds prune **dry-run** and requires **`checks.evidencePruneDryRunPass`**. **`run-h5-closeout-evidence.mjs`** chains remediation playbook + baseline so H5 closeout evidence carries the same signals.
- **Post-H16 sustainment:** `npm run verify:sustainment-loop` runs **`validate:horizon-status`** + **`run:h20-assurance-bundle`** + **`validate:evidence-volume`**. Closeout gates (**`validate:h17-closeout`** … **`validate:h20-closeout`**) consume the sustainment manifest and must **not** be nested inside the loop.
- **Goal policy window:** `npm run validate:goal-policy-file` defaults to **H2→H20** (`package.json`).
- **CI:** `unified-ci` runs advisory **`verify:evidence-prune`** (TTL `0`), **`bundle:h4-closeout-evidence`**, **`bundle:h5-evidence-baseline`**, then **release-readiness** with **`UNIFIED_RELEASE_READINESS_REQUIRE_H5_BASELINE=1`** when configured in `validate-release-readiness.sh`.

## What Was Just Completed (this chunk)

1. **`run-h20-assurance-bundle.mjs`**: H19 + manifest schema sweep; **`package.json`**: **`run:h20-assurance-bundle`**, **`validate:h20-closeout`**, **`validate:goal-policy-file`** **`--until-horizon H20`**; **`run-h16-assurance-bundle`** through **H20**; sustainment runs **`run:h20-assurance-bundle`**.
2. **`GOAL_POLICIES.json` / `HORIZON_STATUS.json`**: **`H19->H20`**; **`h20-action-*`**; required evidence for **H20**; **`VALID_HORIZONS`** includes **H20**; **`validate-horizon-status.mjs`** goal-policy regex allows **H20** (not only `H1[0-9]`).
3. **`validate-horizon-closeout.mjs`**: **`h20-assurance-bundle`** verification; stage-promotion skip for **H20**; **`evaluate-auto-rollback-policy`** **full** for **H20**.
4. **`check-progressive-horizon-goals.mjs`**: terminal skip when active horizon is **H20**.
5. **Docs / tests**: `agent.md`, sustainment checklist, **`horizonStates.H20`** in fixtures.

## Read Order

1. `README.md` → `AGENTS.md` → `AGENT.md` → `docs/CLOUD_AGENT_HANDOFF.md` → `docs/HORIZON_STATUS.json`

## Immediate Next Targets

1. **H21** runway (extend sequences, **`H20->H21`** in both policy files, optional **`run-h21-assurance-bundle`**, bump **`--until-horizon`**, point sustainment at new terminal).
2. **`npm run validate:h20-closeout`** after evidence changes affecting H20 required artifacts.
3. **`npm run verify:sustainment-loop`** after changing assurance, manifest-schema, or volume scripts.

## Validation Pack

```bash
npm run validate:horizon-status
npm run check && npm test
npm run validate:all
```

## Delivery Checklist

- Implement + tests + docs; commit, push, PR.
