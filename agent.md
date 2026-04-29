# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- **Active horizon:** `H18` **completed** per `docs/HORIZON_STATUS.json` (terminal assurance: **`run:h18-assurance-bundle`** chains **`run:h17-assurance-bundle`** + prune rehearsal; **`run:h17-assurance-bundle`** chains **`run:h16-assurance-bundle`** + **`verify:evidence-prune`**).
- **H5 evidence retention (h5-action-10):** `scripts/prune-evidence.mjs` with `npm run prune:evidence` / `npm run verify:evidence-prune`, manifest type **`evidence-prune-run`**, **`h5-evidence-baseline.mjs`** embeds prune **dry-run** and requires **`checks.evidencePruneDryRunPass`**. **`run-h5-closeout-evidence.mjs`** chains remediation playbook + baseline so H5 closeout evidence carries the same signals.
- **Post-H16 sustainment:** `npm run verify:sustainment-loop` runs **`validate:horizon-status`** + **`run:h18-assurance-bundle`** + **`validate:evidence-volume`** (writes `evidence/post-h16-sustainment-loop-*.json`). Closeout gates (**`validate:h17-closeout`**, **`validate:h18-closeout`**) consume this manifest and must **not** be nested inside the loop.
- **Goal policy window:** `npm run validate:goal-policy-file` defaults to **H2→H18** (`package.json`).
- **CI:** `unified-ci` runs advisory **`verify:evidence-prune`** (TTL `0`), **`bundle:h4-closeout-evidence`**, **`bundle:h5-evidence-baseline`**, then **release-readiness** with **`UNIFIED_RELEASE_READINESS_REQUIRE_H5_BASELINE=1`** when configured in `validate-release-readiness.sh`.

## What Was Just Completed (this chunk)

1. **H18 scaffold:** `run-h17-assurance-bundle.mjs`, `run-h18-assurance-bundle.mjs`; **`package.json`** scripts **`run:h17-assurance-bundle`**, **`run:h18-assurance-bundle`**, **`validate:h18-closeout`**; **`run-h16-assurance-bundle`** goal-policy **`--until-horizon H18`**.
2. **`HORIZON_STATUS.json` / `GOAL_POLICIES.json`:** **`H17->H18`** transition; required evidence for H17/H18; **`h18-action-*`** completed; **`VALID_HORIZONS`** includes **H18** in **`validate-horizon-status.mjs`** (goal-policy keys **H<1-18>→H<1-18>**).
3. **`check-progressive-horizon-goals.mjs`:** when **active horizon** is the **terminal sequence entry** (H18) with no **`--next-horizon`**, skip next-horizon growth checks (same pattern as fully completed next horizon).
4. **Sustainment / closeout:** **`validate-post-h16-sustainment-manifest`** accepts **`terminalAssuranceBundlePass`** or legacy **`h16AssuranceBundlePass`**; **`validate-horizon-closeout`** verifies **`h17-assurance-bundle`** and **`h18-assurance-bundle`** payloads; stage-promotion skipped for **H18** closeout.
5. **Tests:** **`horizonStates.H18`** added across fixtures.

## Read Order

1. `README.md` → `AGENTS.md` → `AGENT.md` → `docs/CLOUD_AGENT_HANDOFF.md` → `docs/HORIZON_STATUS.json`

## Immediate Next Targets

1. If you need more runway: add **H19** (repeat: extend `HORIZON_SEQUENCE`, `VALID_HORIZONS`, goal policy **`H18->H19`**, optional **`run-h19-assurance-bundle`**, bump **`validate:goal-policy-file`** default **`--until-horizon`**).
2. **`npm run validate:h18-closeout`** after evidence changes affecting H18 required artifacts.
3. **`npm run verify:sustainment-loop`** in CI or locally after changing assurance or volume scripts.

## Validation Pack

```bash
npm run validate:horizon-status
npm run check && npm test
npm run validate:all
```

## Delivery Checklist

- Implement + tests + docs; commit, push, PR.
