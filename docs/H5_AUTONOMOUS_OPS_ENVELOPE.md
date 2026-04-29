# H5 autonomous operations envelope (draft)

This document expands **h5-action-1** … **h5-action-9** into an operator-facing envelope before deeper H5 execution work lands in code.

## Implemented automation (repo)

- **`npm run bundle:h5-evidence-baseline`** — writes **`evidence/h5-evidence-baseline-*.json`** after **`validate:all`**-style evidence exists (soak, validation-summary, failure-injection, cutover, regression). Validates soak SLO, summary **`gates.passed`**, optional **`emergency-rollback-bundle`** schema, optional **`h4-closeout-evidence`** pass, line-count and P95 budgets (`UNIFIED_H5_BASELINE_*`).
- **`UNIFIED_RELEASE_READINESS_REQUIRE_H5_BASELINE=1`** — **`scripts/release-readiness.mjs`** requires latest **`h5-evidence-baseline-*.json`** with **`pass: true`** (checks surfaced as **`h5BaselineRequired`**, **`h5BaselinePassed`**, **`h5BaselinePath`**).

- **Dispatch success / policy failure rates** — reuse **`npm run validate:soak-slo`** thresholds (`UNIFIED_SOAK_SLO_*`) as baseline SLOs; wire alerts when the latest **`evidence/soak-slo-*.json`** reports `pass: false` while **`UNIFIED_RELEASE_READINESS_REQUIRE_SOAK_SLO=1`** is enabled in promotion environments.
- **P95 latency** — soak SLO manifest already tracks **`p95LatencyMs`**; treat sustained regression vs the last **N** passing manifests as an alert input (implementation TBD in H5).

## Escalation

- **Evidence-first** — every escalation path should cite **`traceId`**, **`validation-summary-*.json`**, and (when applicable) **`unified-dispatch-audit-*.jsonl`** lines with matching **`auditSchemaVersion`**.
- **Rollback** — follow **`docs/PRODUCTION_CUTOVER_RUNBOOK.md`** and **`npm run bundle:emergency-rollback`** for pinned artifact sets.

## Scale envelope (h5-action-2, h5-action-7)

- Target **evidence volume caps** (max JSONL lines per soak run, max retention days under `evidence/`) and **fan-out** (concurrent dispatch workers) as H5 engineering tasks; measurement harness should emit a versioned manifest similar to H3/H4 bundles.

## Load-test harness (h5-action-4)

- Integrate **`validate:soak`** + **`validate:soak-slo`** into scheduled CI or a dedicated soak job; align **`UNIFIED_RELEASE_READINESS_REQUIRE_SOAK_SLO`** policy with production promotion gates.

## Operator runbook (h5-action-5)

- Extend **`docs/PRODUCTION_CUTOVER_RUNBOOK.md`** with H5-specific “full stage + incident” checklists once autonomous monitors are defined; keep commands copy-pastable and evidence paths explicit.

## H5 action mapping

| Action id | This document |
|-----------|----------------|
| h5-action-1 | SLO + alerting + escalation sections |
| h5-action-2 | Scale envelope |
| h5-action-3 | Emergency rollback drills (tie to bundles) |
| h5-action-4 | Load-test / soak SLO integration |
| h5-action-5 | Runbook updates (pointer) |
| h5-action-6 | Planning runway (post-H4 closeout) |
| h5-action-7 | Evidence automation / regression baselines |
| h5-action-8 | Long-window soak scheduling (planned) |
| h5-action-9 | Optional release-readiness baseline gate (`UNIFIED_RELEASE_READINESS_REQUIRE_H5_BASELINE`) |
