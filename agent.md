# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- **Active horizon:** `H16` (terminal merge-readiness slice) per `docs/HORIZON_STATUS.json`.
- **H5 evidence retention (h5-action-10):** `scripts/prune-evidence.mjs` with `npm run prune:evidence` / `npm run verify:evidence-prune`, manifest type **`evidence-prune-run`**, **`h5-evidence-baseline.mjs`** embeds prune **dry-run** and requires **`checks.evidencePruneDryRunPass`**. **`run-h5-closeout-evidence.mjs`** chains remediation playbook + baseline so H5 closeout evidence carries the same signals.
- **CI:** `unified-ci` runs advisory **`verify:evidence-prune`** (TTL `0`), **`bundle:h4-closeout-evidence`**, **`bundle:h5-evidence-baseline`**, then **release-readiness** with **`UNIFIED_RELEASE_READINESS_REQUIRE_H5_BASELINE=1`** when configured in `validate-release-readiness.sh`.

## What Was Just Completed (this chunk)

1. Merged **`origin/main`** (H6–H16 assurance bundles, sustainment loops, tenant/region gates) and reconciled **evidence pruning** scripts with the new tree.
2. Fixed duplicate **`h4CloseoutPath`** in **`h5-evidence-baseline.mjs`**; restored **`package.json`** scripts CI expects (**`bundle:h4/h5`**, **`validate:soak-slo`**, **`prune:evidence`**, etc.).
3. Extended **`run-h5-closeout-evidence.mjs`** to embed **`h5-evidence-baseline`** + prune checks; **`validate-horizon-closeout.mjs`** evaluates **`h5-evidence-baseline`** / **`evidence-prune-run`** commands and tightens **h5-closeout-evidence** checks.
4. **`.env.example`** documents baseline/prune env vars; **`docs/HORIZON_STATUS.json`** timestamp + H5 summary/history note.

## Read Order

1. `README.md` → `AGENTS.md` → `AGENT.md` → `docs/CLOUD_AGENT_HANDOFF.md` → `docs/HORIZON_STATUS.json`

## Immediate Next Targets

1. **`verify:sustainment-loop`** and **`run:h16-assurance-bundle`** after local evidence changes (goal-policy file validation window is **H2→H16**).
2. Optional: add **`h17-action-*`** runway if you need progressive-goal growth beyond terminal **H16** (not in repo yet).

## Validation Pack

```bash
npm run validate:horizon-status
npm run check && npm test
npm run validate:all
```

## Delivery Checklist

- Implement + tests + docs; commit, push, PR.
