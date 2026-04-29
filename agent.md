# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- Active horizon: `H2` (`docs/HORIZON_STATUS.json`). **H5** actions **h5-action-1** … **h5-action-10** are **completed**. **H6** runway: **h6-action-1** … **h6-action-3** are **planned** (cutover evidence pack, directory size guardrails, retention docs).
- **CI:** **`unified-ci`** runs **`bundle:h5-evidence-baseline`** before **release-readiness** with **`UNIFIED_RELEASE_READINESS_REQUIRE_H5_BASELINE=1`**. **`soak-long-window`** workflow schedules weekly long soak + **`soak-slo-scheduled-*.json`** artifacts.

## What Was Just Completed (this chunk)

1. **`scripts/prune-evidence.mjs`** + **`npm run prune:evidence`** / **`verify:evidence-prune`** — TTL pruning + **`evidence-prune-run`** manifest schema; H5 baseline embeds prune dry-run.
2. **`docs/HORIZON_STATUS.json`** — **`h5-action-10`** completed; **`requiredEvidence`** **`h5-evidence-prune-dry-run`**; **H6** states + **h6-action-1..3**; **`H5->H6`** goal policy.
3. **`docs/GOAL_POLICIES.json`**, horizon scripts — **`H6`** in sequences / **`VALID_HORIZONS`**; **`validate:goal-policy-file`** through **H6**.
4. **`unified-ci`** — advisory **`verify:evidence-prune`** step (**`UNIFIED_EVIDENCE_PRUNE_TTL_DAYS=0`**).
5. **`docs/PRODUCTION_CUTOVER_RUNBOOK.md`**, **`docs/H5_AUTONOMOUS_OPS_ENVELOPE.md`**, **`docs/CLOUD_AGENT_HANDOFF.md`**, **`.env.example`**, tests.

## Read Order

1. `README.md` → `AGENTS.md` → `AGENT.md` → `docs/CLOUD_AGENT_HANDOFF.md` → `docs/H5_AUTONOMOUS_OPS_ENVELOPE.md` → `docs/HORIZON_STATUS.json`

## Immediate Next Targets

1. **`h6-action-1`** — pinned production cutover evidence pack (release-readiness + H5 baseline + prune report per promotion window).
2. **`h6-action-2`** — evidence directory size / file-count guardrails.
3. **`h6-action-3`** — scheduled-soak vs local prune retention documentation.

## Validation Pack

```bash
npm run validate:horizon-status
npm run check && npm test
npm run validate:all
```

## Delivery Checklist

- Implement + tests + docs; commit, push, PR.
