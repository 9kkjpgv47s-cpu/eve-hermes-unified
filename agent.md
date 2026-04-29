# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- **Active horizon:** `H21` **completed** per `docs/HORIZON_STATUS.json` (terminal: **`run:h21-assurance-bundle`** = **`run:h20-assurance-bundle`** + **`validate-horizon-status`** on `docs/HORIZON_STATUS.json`; **H20** = **H19** + **`validate:manifest-schemas`**; chain continues through **H16**).
- **H5 evidence retention (h5-action-10):** `scripts/prune-evidence.mjs` with `npm run prune:evidence` / `npm run verify:evidence-prune`, manifest type **`evidence-prune-run`**, **`h5-evidence-baseline.mjs`** embeds prune **dry-run** and requires **`checks.evidencePruneDryRunPass`**. **`run-h5-closeout-evidence.mjs`** chains remediation playbook + baseline so H5 closeout evidence carries the same signals.
- **Post-H16 sustainment:** `npm run verify:sustainment-loop` runs **`validate:horizon-status`** + **`run:h21-assurance-bundle`** + **`validate:evidence-volume`**. Closeout gates (**`validate:h17-closeout`** … **`validate:h21-closeout`**) consume the sustainment manifest and must **not** be nested inside the loop.
- **Goal policy window:** `npm run validate:goal-policy-file` defaults to **H2→H21** (`package.json`).
- **CI:** `unified-ci` runs advisory **`verify:evidence-prune`** (TTL `0`), **`bundle:h4-closeout-evidence`**, **`bundle:h5-evidence-baseline`**, then **release-readiness** with **`UNIFIED_RELEASE_READINESS_REQUIRE_H5_BASELINE=1`** when configured in `validate-release-readiness.sh`.

## What Was Just Completed (this chunk)

1. **`run-h21-assurance-bundle.mjs`**: H20 + final horizon-status recheck; **`package.json`**: **`run:h21-assurance-bundle`**, **`validate:h21-closeout`**, **`validate:goal-policy-file`** **`--until-horizon H21`**; **`run-h16-assurance-bundle`** through **H21**; sustainment runs **`run:h21-assurance-bundle`**.
2. **`GOAL_POLICIES.json` / `HORIZON_STATUS.json`**: **`H20->H21`**; **`h21-action-*`**; H21 required evidence; embedded **`goalPolicies`** aligned with file; **`validate-horizon-status.mjs`** **`VALID_HORIZONS`** + goal-policy regex **H1–H21** (supports **H20**/**H21**).
3. **`validate-horizon-closeout.mjs`**: **`HORIZON_STAGE_MAP`** restored for **H18–H21**; **`h21-assurance-bundle`** verification; stage-promotion skip for **H21**.
4. **`evaluate-auto-rollback-policy.mjs`**: **H21** uses **full** stage.
5. **Docs**: `agent.md`, `docs/CLOUD_AGENT_HANDOFF.md`, `docs/MASTER_EXECUTION_CHECKLIST.md` (update after edits).

## Read Order

1. `README.md` → `AGENTS.md` → `AGENT.md` → `docs/CLOUD_AGENT_HANDOFF.md` → `docs/HORIZON_STATUS.json`

## Immediate Next Targets

1. **H22** runway (extend sequences, **`H21->H22`** in both policy sources, **`run-h22-assurance-bundle`**, bump **`--until-horizon`**, point sustainment at new terminal; **verify `HORIZON_SEQUENCE` has no skipped integers** when appending).
2. **`npm run validate:h21-closeout`** after evidence changes affecting H21 required artifacts.
3. **`npm run verify:sustainment-loop`** after changing assurance scripts.

## Validation Pack

```bash
npm run validate:horizon-status
npm run check && npm test
npm run validate:all
```

## Delivery Checklist

- Implement + tests + docs; commit, push, PR.
