# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- **Active horizon:** `H33` **completed** per `docs/HORIZON_STATUS.json` (terminal: **`run:h33-assurance-bundle`** = **`run:h32-assurance-bundle`** + **`validate-horizon-status`** on `docs/HORIZON_STATUS.json`; **H32** = **H31** + **`validate:manifest-schemas`**; chain continues through **H16**).
- **H5 evidence retention (h5-action-10):** `scripts/prune-evidence.mjs` with `npm run prune:evidence` / `npm run verify:evidence-prune`, manifest type **`evidence-prune-run`**, **`h5-evidence-baseline.mjs`** embeds prune **dry-run** and requires **`checks.evidencePruneDryRunPass`**. **`run-h5-closeout-evidence.mjs`** chains remediation playbook + baseline so H5 closeout evidence carries the same signals.
- **Post-H16 sustainment:** `npm run verify:sustainment-loop` runs **`validate:horizon-status`** + **`run:h33-assurance-bundle`** + **`validate:evidence-volume`**. Closeout gates (**`validate:h17-closeout`** … **`validate:h33-closeout`**) consume the sustainment manifest and must **not** be nested inside the loop.
- **Goal policy window:** `npm run validate:goal-policy-file` defaults to **H2→H33** (`package.json`).
- **CI:** `unified-ci` runs advisory **`verify:evidence-prune`** (TTL `0`), **`bundle:h4-closeout-evidence`**, **`bundle:h5-evidence-baseline`**, then **release-readiness** with **`UNIFIED_RELEASE_READINESS_REQUIRE_H5_BASELINE=1`** when configured in `validate-release-readiness.sh`.

## What Was Just Completed (this chunk)

1. **`run-h32-assurance-bundle.mjs` / `run-h33-assurance-bundle.mjs`**: H32 = H31 + **`validate:manifest-schemas`**; H33 = H32 + **`validate-horizon-status`**. **`package.json`**: **`run:h32-assurance-bundle`**, **`run:h33-assurance-bundle`**, **`validate:h32-closeout`**, **`validate:h33-closeout`**, **`validate:goal-policy-file`** **`--until-horizon H33`**; **`run-h16-assurance-bundle`** through **H33**; sustainment runs **`run:h33-assurance-bundle`**.
2. **`GOAL_POLICIES.json` / `HORIZON_STATUS.json`**: **`H31->H32`**, **`H32->H33`**; **`h32-action-*`**, **`h33-action-*`**; required evidence; predecessor horizons through **H33**; embedded **`goalPolicies`**; **`validate-horizon-status.mjs`** **`VALID_HORIZONS`** + transition regex **H1–H33**.
3. **`validate-horizon-closeout.mjs`**: **`H32`**, **`H33`**; **`h32-assurance-bundle`**, **`h33-assurance-bundle`** verification; stage-promotion skip for **H32**–**H33**.
4. **`evaluate-auto-rollback-policy.mjs`**: **H32**–**H33** use **full** stage.
5. **Docs**: `agent.md`, `docs/CLOUD_AGENT_HANDOFF.md`, `docs/MASTER_EXECUTION_CHECKLIST.md` (update after edits).

## Read Order

1. `README.md` → `AGENTS.md` → `AGENT.md` → `docs/CLOUD_AGENT_HANDOFF.md` → `docs/HORIZON_STATUS.json`

## Immediate Next Targets

1. **H34** runway (extend sequences, **`H33->H34`** in both policy sources, **`run-h34-assurance-bundle`** = **`run:h33-assurance-bundle`** + **`validate:manifest-schemas`**, bump **`--until-horizon`**, point sustainment at new terminal).
2. **`npm run validate:h33-closeout`** after evidence changes affecting H33 required artifacts.
3. **`npm run verify:sustainment-loop`** after changing assurance scripts.

## Validation Pack

```bash
npm run validate:horizon-status
npm run check && npm test
npm run validate:all
```

## Delivery Checklist

- Implement + tests + docs; commit, push, PR.
