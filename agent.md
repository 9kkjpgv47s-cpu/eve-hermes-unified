# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- **Active horizon:** `H30` **completed** per `docs/HORIZON_STATUS.json` (terminal: **`run:h30-assurance-bundle`** = **`run:h29-assurance-bundle`** + **`validate:manifest-schemas`** over **`evidence/`**; **H29** = **H28** + **`validate-horizon-status`** on `docs/HORIZON_STATUS.json`; chain continues through **H16**).
- **H5 evidence retention (h5-action-10):** `scripts/prune-evidence.mjs` with `npm run prune:evidence` / `npm run verify:evidence-prune`, manifest type **`evidence-prune-run`**, **`h5-evidence-baseline.mjs`** embeds prune **dry-run** and requires **`checks.evidencePruneDryRunPass`**. **`run-h5-closeout-evidence.mjs`** chains remediation playbook + baseline so H5 closeout evidence carries the same signals.
- **Post-H16 sustainment:** `npm run verify:sustainment-loop` runs **`validate:horizon-status`** + **`run:h30-assurance-bundle`** + **`validate:evidence-volume`**. Closeout gates (**`validate:h17-closeout`** … **`validate:h30-closeout`**) consume the sustainment manifest and must **not** be nested inside the loop.
- **Goal policy window:** `npm run validate:goal-policy-file` defaults to **H2→H30** (`package.json`).
- **CI:** `unified-ci` runs advisory **`verify:evidence-prune`** (TTL `0`), **`bundle:h4-closeout-evidence`**, **`bundle:h5-evidence-baseline`**, then **release-readiness** with **`UNIFIED_RELEASE_READINESS_REQUIRE_H5_BASELINE=1`** when configured in `validate-release-readiness.sh`.

## What Was Just Completed (this chunk)

1. **`run-h30-assurance-bundle.mjs`**: H29 + **`validate:manifest-schemas`**; **`package.json`**: **`run:h30-assurance-bundle`**, **`validate:h30-closeout`**, **`validate:goal-policy-file`** **`--until-horizon H30`**; **`run-h16-assurance-bundle`** invokes goal-policy through **H30**; sustainment runs **`run:h30-assurance-bundle`**.
2. **`GOAL_POLICIES.json` / `HORIZON_STATUS.json`**: **`H29->H30`**; **`h30-action-*`**; H30 required evidence; predecessor **`requiredEvidence`** horizons extended through **H30**; embedded **`goalPolicies`** aligned with file; **`validate-horizon-status.mjs`** **`VALID_HORIZONS`** + goal-policy regex **H1–H30** transition keys.
3. **`validate-horizon-closeout.mjs`**: **`H30`** in sequence and stage map; **`h30-assurance-bundle`** verification; stage-promotion skip for **H30**.
4. **`evaluate-auto-rollback-policy.mjs`**: **H30** uses **full** stage.
5. **Docs**: `agent.md`, `docs/CLOUD_AGENT_HANDOFF.md`, `docs/MASTER_EXECUTION_CHECKLIST.md` (update after edits).

## Read Order

1. `README.md` → `AGENTS.md` → `AGENT.md` → `docs/CLOUD_AGENT_HANDOFF.md` → `docs/HORIZON_STATUS.json`

## Immediate Next Targets

1. **H31** runway (extend sequences, **`H30->H31`** in both policy sources, **`run-h31-assurance-bundle`** with alternating terminal pattern, bump **`--until-horizon`**, point sustainment at new terminal; **verify `HORIZON_SEQUENCE` has no skipped integers** when appending).
2. **`npm run validate:h30-closeout`** after evidence changes affecting H30 required artifacts.
3. **`npm run verify:sustainment-loop`** after changing assurance scripts.

## Validation Pack

```bash
npm run validate:horizon-status
npm run check && npm test
npm run validate:all
```

## Delivery Checklist

- Implement + tests + docs; commit, push, PR.
