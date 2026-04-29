# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- **Active horizon:** `H35` **completed** per `docs/HORIZON_STATUS.json` (terminal: **`run:h35-assurance-bundle`** = **`run:h34-assurance-bundle`** + **`validate-horizon-status`** on `docs/HORIZON_STATUS.json`; **H34** = **H33** + **`validate:manifest-schemas`**; chain continues through **H16**).
- **H5 evidence retention (h5-action-10):** `scripts/prune-evidence.mjs` with `npm run prune:evidence` / `npm run verify:evidence-prune`, manifest type **`evidence-prune-run`**, **`h5-evidence-baseline.mjs`** embeds prune **dry-run** and requires **`checks.evidencePruneDryRunPass`**. **`run-h5-closeout-evidence.mjs`** chains remediation playbook + baseline so H5 closeout evidence carries the same signals.
- **Post-H16 sustainment:** `npm run verify:sustainment-loop` runs **`validate:horizon-status`** + **`run:h35-assurance-bundle`** + **`validate:evidence-volume`**. Closeout gates (**`validate:h17-closeout`** … **`validate:h35-closeout`**) consume the sustainment manifest and must **not** be nested inside the loop.
- **Goal policy window:** `npm run validate:goal-policy-file` defaults to **H2→H35** (`package.json`).
- **CI:** `unified-ci` runs advisory **`verify:evidence-prune`** (TTL `0`), **`bundle:h4-closeout-evidence`**, **`bundle:h5-evidence-baseline`**, then **release-readiness** with **`UNIFIED_RELEASE_READINESS_REQUIRE_H5_BASELINE=1`** when configured in `validate-release-readiness.sh`.

## What Was Just Completed (this chunk)

1. **`run-h34-assurance-bundle.mjs` / `run-h35-assurance-bundle.mjs`**: H34 = H33 + **`validate:manifest-schemas`**; H35 = H34 + **`validate-horizon-status`**. **`package.json`**: **`run:h34-assurance-bundle`**, **`run:h35-assurance-bundle`**, **`validate:h34-closeout`**, **`validate:h35-closeout`**, **`validate:goal-policy-file`** **`--until-horizon H35`**; **`run-h16-assurance-bundle`** through **H35**; sustainment runs **`run:h35-assurance-bundle`**.
2. **`GOAL_POLICIES.json` / `HORIZON_STATUS.json`**: **`H33->H34`**, **`H34->H35`**; **`h34-action-*`**, **`h35-action-*`**; required evidence; predecessor horizons through **H35**; embedded **`goalPolicies`**; **`validate-horizon-status.mjs`** **`VALID_HORIZONS`** + transition regex **H1–H35**.
3. **`validate-horizon-closeout.mjs`**: **`H34`**, **`H35`**; **`h34-assurance-bundle`**, **`h35-assurance-bundle`** verification; stage-promotion skip for **H34**–**H35**.
4. **`evaluate-auto-rollback-policy.mjs`**: **H34**–**H35** use **full** stage.
5. **Docs**: `agent.md`, `docs/CLOUD_AGENT_HANDOFF.md`, `docs/MASTER_EXECUTION_CHECKLIST.md` (update after edits).

## Read Order

1. `README.md` → `AGENTS.md` → `AGENT.md` → `docs/CLOUD_AGENT_HANDOFF.md` → `docs/HORIZON_STATUS.json`

## Immediate Next Targets

1. **H36** runway (extend sequences, **`H35->H36`** in both policy sources, **`run-h36-assurance-bundle`** = **`run:h35-assurance-bundle`** + **`validate:manifest-schemas`**, bump **`--until-horizon`**, point sustainment at new terminal).
2. **`npm run validate:h35-closeout`** after evidence changes affecting H35 required artifacts.
3. **`npm run verify:sustainment-loop`** after changing assurance scripts.

## Validation Pack

```bash
npm run validate:horizon-status
npm run check && npm test
npm run validate:all
```

## Delivery Checklist

- Implement + tests + docs; commit, push, PR.
