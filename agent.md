# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- Active horizon: `H2` (`docs/HORIZON_STATUS.json`). **H5** actions **h5-action-1** … **h5-action-7** are **completed** (baseline bundle, release-readiness optional gate, runbook, soak/SLO + evidence-summary fixes). **h5-action-8** and **h5-action-9** remain **planned**.
- **Required evidence:** H4-scoped **`h4-closeout-evidence`**; H5-scoped **`h5-evidence-baseline`** (`npm run verify:h5-evidence-baseline`).
- Branch: **`cursor/h5-evidence-baseline-cc15`** (or merge from it) — H5 baseline + soak/SLO + summarize-evidence fixes.

## What Was Just Completed (large chunk)

1. **`scripts/h5-evidence-baseline.mjs`** — **`npm run bundle:h5-evidence-baseline`** / **`verify:h5-evidence-baseline`**: soak SLO on latest **`soak-*.jsonl`**, validation-summary **`gates.passed`**, P95 + line-count budgets, optional **`h4-closeout-evidence`** + **`emergency-rollback-bundle`** schema checks.
2. **`validate-manifest-schema.mjs`** — type **`h5-evidence-baseline`**; **`--type all`** includes latest baseline manifest.
3. **`validate-horizon-closeout.mjs`** — evaluates **`npm run verify:h5-evidence-baseline`**.
4. **`scripts/release-readiness.mjs`** — **`UNIFIED_RELEASE_READINESS_REQUIRE_H5_BASELINE=1`** requires latest **`h5-evidence-baseline-*.json`** with **`pass: true`** (checks **`h5BaselineRequired`**, **`h5BaselinePassed`**, **`h5BaselinePath`**).
5. **`scripts/validate-soak-slo.mjs`** — parses **multi-line** pretty-printed dispatch JSON in soak logs (brace scanner + dedupe by **`traceId`**).
6. **`scripts/summarize-evidence.mjs`** — picks **`soak-*.jsonl`** only so **`soak-slo-baseline-*.json`** does not shadow real soak logs.
7. **`docs/HORIZON_STATUS.json`**, **`docs/H5_AUTONOMOUS_OPS_ENVELOPE.md`**, **`docs/PRODUCTION_CUTOVER_RUNBOOK.md`**, **`docs/CLOUD_AGENT_HANDOFF.md`**, **`.env.example`**, **CI** (`bundle:h5-evidence-baseline`).
8. **Tests:** `h5-evidence-baseline-script`, manifest schema, **`validate-soak-slo`** multi-line case, **`release-readiness`** H5 baseline missing case.

## Read Order (Zero-Context Startup)

1. `README.md`
2. `AGENTS.md`
3. `AGENT.md`
4. `docs/CLOUD_AGENT_HANDOFF.md`
5. `docs/H5_AUTONOMOUS_OPS_ENVELOPE.md`
6. `docs/HORIZON_STATUS.json`

## Immediate Next High-Output Targets

1. **`h5-action-8`** — scheduled long-window soak + archived **`soak-slo-*.json`** for dashboards.
2. **`h5-action-9`** — wire **`UNIFIED_RELEASE_READINESS_REQUIRE_H5_BASELINE`** into promotion/CI where appropriate.
3. Keep **`npm run validate:all`** green.

## Validation Pack

```bash
npm run check
npm test
npm run validate:all
npm run bundle:h5-evidence-baseline
```

## Guardrails

- Evidence summary must use **`soak-*.jsonl`** dispatch logs (not SLO JSON manifests).
- Bump manifest **`schemaVersion`** only when contract shape changes (follow existing patterns).

## Delivery Checklist Per Iteration

- Implement + tests + docs for operator-visible behavior.
- Commit, push, open/update PR.
