# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- Active horizon: `H2` (`docs/HORIZON_STATUS.json`). **H5** actions **h5-action-1** … **h5-action-9** are **completed**. **h5-action-10** (evidence retention / TTL) is **planned**.
- **CI:** **`unified-ci`** runs **`bundle:h5-evidence-baseline`** before **release-readiness** with **`UNIFIED_RELEASE_READINESS_REQUIRE_H5_BASELINE=1`**. **`soak-long-window`** workflow schedules weekly long soak + **`soak-slo-scheduled-*.json`** artifacts.

## What Was Just Completed (this chunk)

1. **`scripts/run-long-window-soak.sh`** + **`npm run validate:soak-long-window`** — long soak + **`evidence/soak-slo-scheduled-*.json`**.
2. **`.github/workflows/soak-long-window-scheduled.yml`** — weekly cron + **`workflow_dispatch`**; uploads soak log + SLO JSON artifacts.
3. **`scripts/validate-release-readiness.sh`** — when **`UNIFIED_RELEASE_READINESS_REQUIRE_H5_BASELINE=1`**, runs **`bundle:h5-evidence-baseline`** before **`release-readiness.mjs`**.
4. **`.github/workflows/unified-ci.yml`** — reorder: initial-scope, merge-bundle, manifest schemas, H4/H5 bundles, then release-readiness with H5 baseline gate enabled.
5. **`docs/HORIZON_STATUS.json`**, **`docs/H5_AUTONOMOUS_OPS_ENVELOPE.md`**, **`docs/PRODUCTION_CUTOVER_RUNBOOK.md`**, **`docs/CLOUD_AGENT_HANDOFF.md`**, **`.env.example`**, **`test/soak-long-window-script.test.ts`**.

## Read Order

1. `README.md` → `AGENTS.md` → `AGENT.md` → `docs/CLOUD_AGENT_HANDOFF.md` → `docs/H5_AUTONOMOUS_OPS_ENVELOPE.md` → `docs/HORIZON_STATUS.json`

## Immediate Next Targets

1. **`h5-action-10`** — evidence pruning / TTL automation and operator docs.
2. Keep **`npm run validate:all`** and **`npm run validate:release-readiness`** (with env flags) green.

## Validation Pack

```bash
npm run validate:horizon-status
npm run check && npm test
npm run validate:all
```

## Delivery Checklist

- Implement + tests + docs; commit, push, PR.
