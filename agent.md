# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- **Active horizon:** `H17` per `docs/HORIZON_STATUS.json` (evidence volume guard + sustainment; `h17-action-1`–`h17-action-3` completed).
- **H5 evidence retention (h5-action-10):** `scripts/prune-evidence.mjs` with `npm run prune:evidence` / `npm run verify:evidence-prune`, manifest type **`evidence-prune-run`**, **`h5-evidence-baseline.mjs`** embeds prune **dry-run** and requires **`checks.evidencePruneDryRunPass`**. **`run-h5-closeout-evidence.mjs`** chains remediation playbook + baseline so H5 closeout evidence carries the same signals.
- **Post-H16 sustainment:** `npm run verify:sustainment-loop` runs **`validate:horizon-status`** + **`run:h16-assurance-bundle`** + **`validate:evidence-volume`** (writes `evidence/post-h16-sustainment-loop-*.json`). It does **not** run **`validate:h17-closeout`** (that gate consumes the sustainment manifest; nesting would recurse). Run **`npm run validate:h17-closeout`** separately when H17 is active.
- **CI:** `unified-ci` runs advisory **`verify:evidence-prune`** (TTL `0`), **`bundle:h4-closeout-evidence`**, **`bundle:h5-evidence-baseline`**, then **release-readiness** with **`UNIFIED_RELEASE_READINESS_REQUIRE_H5_BASELINE=1`** when configured in `validate-release-readiness.sh`.

## What Was Just Completed (this chunk)

1. **`validate-horizon-status.mjs`:** goal-policy transition keys now allow **H17** (`H<1-17>->H<1-17>`); test fixtures include **`horizonStates.H17`**; fixed malformed JSON in duplicate-transition-key test.
2. **`run-post-h16-sustainment-loop.mjs`:** removed **`validate:h17-closeout`** from the chain to break circular required-evidence; **`validate-post-h16-sustainment-manifest.mjs`** and **`validate-horizon-closeout.mjs`** (post-h16 loop verification) aligned.
3. **`docs/HORIZON_STATUS.json`:** summary text updated; **`docs/MASTER_EXECUTION_CHECKLIST.md`** and **`docs/CLOUD_AGENT_HANDOFF.md`** document sustainment vs H17 closeout.

## Read Order

1. `README.md` → `AGENTS.md` → `AGENT.md` → `docs/CLOUD_AGENT_HANDOFF.md` → `docs/HORIZON_STATUS.json`

## Immediate Next Targets

1. **`npm run validate:h17-closeout`** after **`verify:sustainment-loop`** when validating H17 (or CI step order: sustainment first, then closeout).
2. **`run:h16-assurance-bundle`** after local evidence changes (goal-policy file validation window is **H2→H17** per `package.json`).
3. Long runway: scaffold **H18** in `HORIZON_STATUS.json` / `GOAL_POLICIES.json` / script `HORIZON_SEQUENCE`s when you need the next progressive-goal gate.

## Validation Pack

```bash
npm run validate:horizon-status
npm run check && npm test
npm run validate:all
```

## Delivery Checklist

- Implement + tests + docs; commit, push, PR.
