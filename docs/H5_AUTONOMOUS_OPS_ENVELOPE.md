# H5 autonomous operations envelope (draft)

This document expands **h5-action-1** … **h5-action-10** into an operator-facing envelope.

## Implemented automation (repo)

- **`npm run bundle:h5-evidence-baseline`** — writes **`evidence/h5-evidence-baseline-*.json`** after **`validate:all`**-style evidence exists (soak, validation-summary, failure-injection, cutover, regression). Validates soak SLO, summary **`gates.passed`**, optional **`emergency-rollback-bundle`** schema, optional **`h4-closeout-evidence`** pass, line-count and P95 budgets (`UNIFIED_H5_BASELINE_*`), and **`evidencePruneDryRunPass`** via embedded **`prune-evidence.mjs --dry-run`** (writes **`evidence/evidence-prune-dry-run-*.json`**).
- **`UNIFIED_RELEASE_READINESS_REQUIRE_H5_BASELINE=1`** — **`scripts/validate-release-readiness.sh`** runs **`bundle:h5-evidence-baseline`** before **`release-readiness.mjs`**; the manifest requires a passing **`h5-evidence-baseline-*.json`** (checks **`h5BaselineRequired`**, **`h5BaselinePassed`**, **`h5BaselinePath`**). **`unified-ci`** enables this gate and runs **release-readiness** after the baseline bundle step.
- **Long-window soak (h5-action-8)** — **`npm run validate:soak-long-window`** → **`bash scripts/run-long-window-soak.sh`** (optional first arg = iterations, else **`UNIFIED_SOAK_LONG_ITERATIONS`**, max **2000**). Produces **`evidence/soak-*.jsonl`** and **`evidence/soak-slo-scheduled-<stamp>.json`** for archival / dashboards. Scheduled workflow: **`.github/workflows/soak-long-window-scheduled.yml`** (weekly + **`workflow_dispatch`**); uploads **`soak-long-window-evidence`** and **`soak-slo-scheduled`** artifacts.

## SLO and alerting

- Reuse **`npm run validate:soak-slo`** thresholds (`UNIFIED_SOAK_SLO_*`) as baseline SLOs; alert when the latest soak SLO manifest reports **`pass: false`** while **`UNIFIED_RELEASE_READINESS_REQUIRE_SOAK_SLO=1`** is enabled.
- **P95 latency** — soak SLO and validation-summary both expose P95; **`h5-evidence-baseline`** enforces **`UNIFIED_H5_BASELINE_MAX_P95_LATENCY_MS`** against validation-summary when gates passed.

## Escalation

- **Evidence-first** — cite **`traceId`**, **`validation-summary-*.json`**, and (when applicable) **`unified-dispatch-audit-*.jsonl`** with matching **`auditSchemaVersion`**.
- **Rollback** — **`docs/PRODUCTION_CUTOVER_RUNBOOK.md`** and **`npm run bundle:emergency-rollback`**.

## Scale envelope (h5-action-2, h5-action-7, h5-action-10)

- **`UNIFIED_H5_BASELINE_MAX_SOAK_LINES`** caps soak log size in the baseline gate.
- **h5-action-10:** **`npm run prune:evidence`** / **`npm run verify:evidence-prune`** — age-based pruning for known evidence filename prefixes (`UNIFIED_EVIDENCE_PRUNE_TTL_DAYS`, optional **`UNIFIED_EVIDENCE_PRUNE_PREFIXES`**); machine-readable **`evidence-prune-run-*.json`** (`validate-manifest-schema.mjs --type evidence-prune-run`).

## Load-test harness (h5-action-4)

- **`validate:soak`** (default 20 iter) in **`validate:all`**; **`validate:soak-long-window`** for heavier runs; align **`UNIFIED_RELEASE_READINESS_REQUIRE_SOAK_SLO`** with promotion policy as needed.

## Operator runbook (h5-action-5)

- See **`docs/PRODUCTION_CUTOVER_RUNBOOK.md`** — H5 baseline + long-window soak sections.

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
| h5-action-8 | Long-window soak scheduling + **`soak-slo-scheduled-*.json`** |
| h5-action-9 | Release-readiness baseline gate (`UNIFIED_RELEASE_READINESS_REQUIRE_H5_BASELINE`) |
| h5-action-10 | Evidence retention / TTL (**`prune-evidence.mjs`**, baseline dry-run) |
