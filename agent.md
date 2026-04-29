# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- **Active horizon:** `H39` **completed** per `docs/HORIZON_STATUS.json` (terminal: **`run:h39-assurance-bundle`** = **`run:h38-assurance-bundle`** + **`validate-horizon-status`** on `docs/HORIZON_STATUS.json`; **H38** = **H37** + **`validate:manifest-schemas`**; chain continues through **H16**).
- **H5 evidence retention (h5-action-10):** `scripts/prune-evidence.mjs` with `npm run prune:evidence` / `npm run verify:evidence-prune`, manifest type **`evidence-prune-run`**, **`h5-evidence-baseline.mjs`** embeds prune **dry-run** and requires **`checks.evidencePruneDryRunPass`**. **`run-h5-closeout-evidence.mjs`** chains remediation playbook + baseline so H5 closeout evidence carries the same signals.
- **Post-H16 sustainment:** `npm run verify:sustainment-loop` runs **`validate:horizon-status`** + **`run:h39-assurance-bundle`** + **`validate:evidence-volume`**. Closeout gates (**`validate:h17-closeout`** … **`validate:h39-closeout`**) consume the sustainment manifest and must **not** be nested inside the loop.
- **Goal policy window:** `npm run validate:goal-policy-file` defaults to **H2→H39** (`package.json`).
- **CI:** `unified-ci` runs advisory **`verify:evidence-prune`** (TTL `0`), **`bundle:h4-closeout-evidence`**, **`bundle:h5-evidence-baseline`**, then **release-readiness** with **`UNIFIED_RELEASE_READINESS_REQUIRE_H5_BASELINE=1`** when configured in `validate-release-readiness.sh`.

## What Was Just Completed (this chunk)

1. **`run-h38-assurance-bundle.mjs` / `run-h39-assurance-bundle.mjs`**: H38 = H37 + **`validate:manifest-schemas`**; H39 = H38 + **`validate-horizon-status`**. **`package.json`**: **`run:h38-assurance-bundle`**, **`run:h39-assurance-bundle`**, **`validate:h38-closeout`**, **`validate:h39-closeout`**, **`validate:goal-policy-file`** **`--until-horizon H39`**; **`run-h16-assurance-bundle`** through **H39**; sustainment runs **`run:h39-assurance-bundle`**.
2. **`GOAL_POLICIES.json` / `HORIZON_STATUS.json`**: **`H37->H38`**, **`H38->H39`**; **`h38-action-*`**, **`h39-action-*`**; required evidence; predecessor horizons through **H39**; embedded **`goalPolicies`**; **`validate-horizon-status.mjs`** **`VALID_HORIZONS`** + transition regex **H1–H39** (`H3[0-9]`).
3. **`validate-horizon-closeout.mjs`**: **`H38`**, **`H39`**; **`h38-assurance-bundle`**, **`h39-assurance-bundle`** verification; stage-promotion skip for **H38**–**H39**.
4. **`evaluate-auto-rollback-policy.mjs`**: **H38**–**H39** use **full** stage.
5. **Docs**: `agent.md`, `docs/CLOUD_AGENT_HANDOFF.md`, `docs/MASTER_EXECUTION_CHECKLIST.md` (update after edits).

## Read Order

1. `README.md` → `AGENTS.md` → `AGENT.md` → `docs/CLOUD_AGENT_HANDOFF.md` → `docs/HORIZON_STATUS.json`

## Immediate Next Targets

1. **H40** runway (extend sequences, **`H39->H40`** in both policy sources, **`run-h40-assurance-bundle`** = **`run:h39-assurance-bundle`** + **`validate:manifest-schemas`**, bump **`--until-horizon`**, point sustainment at new terminal). **Note:** goal-policy regex will need **`H40`** (e.g. extend to **`H4[0-9]`** or **`H[1-4][0-9]`** depending on next band).
2. **`npm run validate:h39-closeout`** after evidence changes affecting H39 required artifacts.
3. **`npm run verify:sustainment-loop`** after changing assurance scripts.

## Validation Pack

```bash
npm run validate:horizon-status
npm run check && npm test
npm run validate:all
```

## Delivery Checklist

- Implement + tests + docs; commit, push, PR.
