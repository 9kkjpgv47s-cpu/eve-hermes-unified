# Production Cutover Runbook

## Strategy

Perform staged rollout with live rollback capability.

### Stage A: Shadow
- Keep user responses from Eve lane.
- Evaluate Hermes lane output and parity in logs only.

### Stage B: Canary
- Route a small allowlist of chats through Hermes-primary policy.
- Keep fallback lane enabled.
- Set:
  - `UNIFIED_ROUTER_CUTOVER_STAGE=canary`
  - `UNIFIED_ROUTER_CANARY_CHAT_IDS=<comma-separated chat ids>`
  - `UNIFIED_ROUTER_DEFAULT_PRIMARY=eve`
  - `UNIFIED_ROUTER_DEFAULT_FALLBACK=hermes`
  - `UNIFIED_ROUTER_FAIL_CLOSED=1`

### Stage C: Majority
- Expand Hermes-primary routing to majority traffic.
- Maintain rollback switch.
- Set:
  - `UNIFIED_ROUTER_CUTOVER_STAGE=majority`
  - `UNIFIED_ROUTER_MAJORITY_PERCENT=<0..100>`
  - `UNIFIED_ROUTER_DEFAULT_PRIMARY=eve`
  - `UNIFIED_ROUTER_DEFAULT_FALLBACK=hermes`
  - `UNIFIED_ROUTER_FAIL_CLOSED=1`

### Stage D: Full Cutover
- Route all traffic through unified merged runtime policy.
- Disable legacy direct path entry points.
- Set:
  - `UNIFIED_ROUTER_CUTOVER_STAGE=full`
  - `UNIFIED_ROUTER_DEFAULT_PRIMARY=hermes`
  - `UNIFIED_ROUTER_DEFAULT_FALLBACK=none`
  - `UNIFIED_ROUTER_FAIL_CLOSED=1`

## Rollback Switch

Set:

- `UNIFIED_ROUTER_DEFAULT_PRIMARY=eve`
- `UNIFIED_ROUTER_DEFAULT_FALLBACK=none`
- `UNIFIED_ROUTER_FAIL_CLOSED=1`
- `UNIFIED_ROUTER_CUTOVER_STAGE=shadow`
- `UNIFIED_ROUTER_CANARY_CHAT_IDS=`
- `UNIFIED_ROUTER_MAJORITY_PERCENT=0`

Then restart unified runtime.

## Operational Checks

- Confirm gateway health.
- Verify trace continuity for recent messages.
- Verify failure classes and response classes are expected.
- Confirm no unexpected lane drift.
- Run automated readiness verifier before stage promotion:

```bash
npm run validate:cutover-readiness
```
- Run validation bundle before and after each stage shift:
  - `npm run validate:failure-injection`
  - `npm run validate:soak`
  - `UNIFIED_EVIDENCE_REQUIRE_FAILURE_SCENARIOS=1 npm run validate:evidence-summary`
- Confirm `failureScenarioPassCount=5` and SLO gates pass in summary JSON.

## Emergency Actions

1. Trigger rollback switch.
2. Restart runtime.
3. Verify Eve-only message flow.
4. Capture incident evidence and route to remediation queue.

## Automated Readiness and Regression Gates

- `npm run validate:regression-eve-primary` validates Eve-primary/no-fallback safe-lane behavior.
- `npm run validate:cutover-readiness` executes staged cutover checks for shadow/canary/majority/full and confirms rollback returns to Eve-safe configuration.

## Merge Bundle Retrieval and Verification (Operator Procedure)

Use this flow before stage promotion when consuming CI artifacts.

### 1) Retrieve evidence artifacts from CI

- Download the `unified-evidence` artifact from the latest green `unified-ci` run.
- Extract it locally to a working directory, for example:

```bash
mkdir -p /tmp/unified-evidence
tar -xzf unified-evidence.tar.gz -C /tmp/unified-evidence
```

### 2) Locate the latest bundle verification inputs

- Latest merge-bundle validation manifest:
  - `/tmp/unified-evidence/evidence/merge-bundle-validation-*.json`
- Latest bundle manifest:
  - `/tmp/unified-evidence/evidence/merge-readiness-bundle-*/merge-readiness-manifest.json`
- Latest bundle archive:
  - `/tmp/unified-evidence/evidence/merge-readiness-bundle-*.tar.gz`

### 3) Verify bundle integrity and schema

Run:

```bash
npm run verify:merge-bundle -- \
  --validation-manifest /tmp/unified-evidence/evidence/merge-bundle-validation-<stamp>.json \
  --bundle-manifest /tmp/unified-evidence/evidence/merge-readiness-bundle-<stamp>/merge-readiness-manifest.json \
  --archive /tmp/unified-evidence/evidence/merge-readiness-bundle-<stamp>.tar.gz
```

Expected result:
- Exit code `0`
- JSON output with:
  - `"pass": true`
  - `"checks.manifestSchemaValid": true`
  - `"checks.bundleManifestPass": true`
  - `"checks.releaseReadinessPass": true`
  - `"checks.initialScopePass": true`
  - `"checks.archiveMissingEntries": []`

If verification fails, do not promote cutover stage. Re-run validation/bundle generation and investigate missing or invalid artifacts.

## Stage Promotion Readiness Gate

Before any stage advance (`shadow -> canary -> majority -> full`), run:

```bash
npm run check:stage-promotion -- --target-stage canary --evidence-dir evidence
```

Default behavior:
- reads latest evidence under `evidence/`
- validates latest `validation-summary`, `cutover-readiness`, `release-readiness`, `merge-bundle-validation`, and `bundle-verification` artifacts
- enforces required gate pass states before allowing promotion
- writes machine-readable output:
  - `evidence/stage-promotion-readiness-*.json`

Use explicit thresholds/targets when needed:

```bash
npm run check:stage-promotion -- \
  --target-stage canary \
  --evidence-dir evidence
```

Promotion policy:
- If `check:stage-promotion` exits non-zero, do **not** promote.
- Resolve failing gates, regenerate evidence, and rerun.

## One-Step Promotion Executor

Use a single command to run promotion readiness and apply stage controls to the gateway env file:

```bash
npm run promote:stage -- \
  --target-stage canary \
  --env-file "$HOME/.openclaw/run/gateway.env" \
  --horizon-status-file docs/HORIZON_STATUS.json \
  --evidence-dir evidence \
  --canary-chats "100,200"
```

Behavior:
- Runs `check-stage-promotion-readiness` first and writes `evidence/stage-promotion-readiness-*.json`.
- Applies stage settings with `scripts/prod-cutover-stage.sh` only when readiness passes.
- Writes execution result to `evidence/stage-promotion-execution-*.json`.

Safe operation flags:
- `--dry-run` validates readiness without mutating env files.
- `--allow-horizon-mismatch` (or `--ignore-horizon-target`) is intended for CI/testing only.
- `--evidence-selection-mode <latest|latest-passing>` controls whether readiness checks consume newest artifacts or newest passing artifacts.

## Auto-Rollback Policy Gate (H2+)

When operating in canary/majority/full stages, evaluate rollback policy from evidence before deciding to continue traffic:

```bash
npm run evaluate:auto-rollback-policy -- \
  --stage canary \
  --evidence-dir evidence \
  --horizon-status-file docs/HORIZON_STATUS.json
```

Default decision behavior:
- `decision: hold` when all required gates pass for the current stage.
- `decision: rollback` when critical SLO/failure gates are violated.

Snapshot pinning options:
- `--validation-summary-file <path>`
- `--cutover-readiness-file <path>`
- `--release-readiness-file <path>`
- `--stage-promotion-readiness-file <path>`

Use these when you need rollback-policy evaluation to consume the same artifact set selected by a preceding promotion-readiness step.

Artifact selection mode:
- `--evidence-selection-mode latest` (default) uses newest matching artifacts by filename order.
- `--evidence-selection-mode latest-passing` uses newest artifacts that also pass their gate payload checks.

Policy expectations:
- Canary rollback trigger:
  - success rate below threshold
  - missing trace rate above threshold
  - any unclassified failures
  - evidence/cutover/release/merge verification gate failures
- Majority/full add:
  - failure scenario pass-count threshold

Machine-readable output:
- `evidence/auto-rollback-policy-*.json`

If decision is rollback, execute:

```bash
npm run cutover:rollback
```

Then verify post-action state with:
- `npm run validate:cutover-readiness`
- `npm run evaluate:auto-rollback-policy -- --stage shadow --evidence-dir evidence`

## Stage Drill Orchestrator (H2+)

Use a single command to run:
1) stage promotion readiness/apply (`promote:stage`)
2) auto-rollback policy evaluation (`evaluate:auto-rollback-policy`)

```bash
npm run run:stage-drill -- \
  --target-stage canary \
  --evidence-dir evidence \
  --horizon-status-file docs/HORIZON_STATUS.json \
  --runtime-env-file "$HOME/.openclaw/run/gateway.env" \
  --canary-chats "100,200"
```

Behavior:
- Always writes a unified drill report: `evidence/stage-drill-<stage>-*.json`
- Captures child command execution details for both promotion and rollback-policy checks.
- Pins rollback-policy evaluation to the exact evidence files selected during promotion/readiness whenever available.
- Fails the drill when:
  - stage promotion step fails, or
  - rollback policy output is missing/unreadable, or
  - rollback policy action is `rollback`.

Useful flags:
- `--dry-run`: validate promotion/readiness and rollback policy without mutating stage env values.
- `--allow-horizon-mismatch`: bypass horizon-target matching for CI/test-only workflows.
- `--auto-apply-rollback`: if policy action is `rollback`, execute Eve-safe rollback automatically.
- `--evidence-selection-mode <latest|latest-passing>`: control artifact selection policy for both promotion/readiness and rollback-policy evaluation.

## H2 Drill Suite Orchestrator (Canary + Majority + Rollback Simulation)

Use a single command to run the full H2 drill sequence:
1) canary hold-path drill
2) majority hold-path drill
3) rollback-trigger simulation drill

```bash
npm run run:h2-drill-suite -- \
  --evidence-dir evidence \
  --horizon-status-file docs/HORIZON_STATUS.json \
  --runtime-env-file "$HOME/.openclaw/run/gateway.env" \
  --canary-chats "100,200" \
  --majority-percent "90" \
  --dry-run
```

Behavior:
- writes suite manifest: `evidence/h2-drill-suite-*.json`
- writes per-step drill reports:
  - `evidence/canary-stage-drill-*.json`
  - `evidence/majority-stage-drill-*.json`
  - `evidence/rollback-sim-stage-drill-*.json`
- returns non-zero if canary/majority hold-path checks fail or rollback simulation does not trigger as expected

Key controls:
- `--skip-majority`
- `--skip-rollback-simulation`
- `--strict-horizon-target`
- `--rollback-force-min-success-rate <value>` (default `1.01`) to force a rollback simulation trigger
- `--auto-apply-rollback` to execute rollback during simulation when policy triggers
- `--evidence-selection-mode <latest|latest-passing>` to run the suite against newest artifacts or newest passing artifacts

## H2 Threshold Calibration and Supervised Auto-Apply Rollback

Use a single calibration command to derive operator rollback-policy thresholds from recent validation summaries:

```bash
npm run calibrate:rollback-thresholds -- \
  --stage majority \
  --evidence-dir evidence \
  --window 5 \
  --min-samples 3 \
  --evidence-selection-mode latest-passing
```

Calibration output:
- `evidence/rollback-threshold-calibration-<stage>-*.json`
- includes:
  - selected summary sample set and mode (`latest` or `latest-passing`)
  - observed metrics envelope
  - recommended threshold args for `evaluate:auto-rollback-policy` / `run:stage-drill`

Run supervised rollback auto-apply simulation using calibrated thresholds:

```bash
npm run run:supervised-rollback-simulation -- \
  --stage majority \
  --current-stage canary \
  --evidence-dir evidence \
  --horizon-status-file docs/HORIZON_STATUS.json \
  --env-file "$HOME/.openclaw/run/gateway.env" \
  --majority-percent "90" \
  --allow-horizon-mismatch
```

Behavior:
- generates calibration report if one is not provided
- executes `run:stage-drill` with `--auto-apply-rollback` and rollback-forcing thresholds (default force min success rate `1.01`)
- verifies post-action rollback state in gateway env:
  - `UNIFIED_ROUTER_CUTOVER_STAGE=shadow`
  - `UNIFIED_ROUTER_DEFAULT_PRIMARY=eve`
  - `UNIFIED_ROUTER_DEFAULT_FALLBACK=none`
  - `UNIFIED_ROUTER_FAIL_CLOSED=1`
  - `UNIFIED_ROUTER_MAJORITY_PERCENT=0`
- emits combined evidence:
  - `evidence/supervised-rollback-simulation-*.json`

Safety/testing flags:
- `--dry-run` to evaluate flow without applying rollback writes
- `--skip-cutover-readiness` for isolated CI tests where dispatch readiness probes are unavailable

H2 closeout evidence gate:

```bash
npm run validate:h2-closeout -- --evidence-dir evidence --horizon-status-file docs/HORIZON_STATUS.json
```

Expected result:
- exit code `0`
- output manifest: `evidence/horizon-closeout-H2-*.json`
- required H2 evidence passes in the manifest:
  - `h2-drill-suite`
  - `h2-rollback-threshold-calibration`
  - `h2-supervised-rollback-simulation`

One-command H2 closeout runner:

```bash
npm run run:h2-closeout -- \
  --evidence-dir evidence \
  --horizon-status-file docs/HORIZON_STATUS.json \
  --env-file "$HOME/.openclaw/run/gateway.env" \
  --allow-horizon-mismatch
```

Runner behavior:
- executes rollback-threshold calibration, supervised rollback simulation, and H2 closeout validation in sequence
- writes consolidated manifest:
  - `evidence/h2-closeout-run-*.json`
- references step artifacts:
  - `evidence/rollback-threshold-calibration-<stage>-*.json`
  - `evidence/supervised-rollback-simulation-*.json`
  - `evidence/horizon-closeout-H2-*.json`

## Horizon Promotion Executor (Closeout-Gated)

Use a single command to promote a horizon in `docs/HORIZON_STATUS.json` only when closeout evidence passes:

```bash
npm run promote:horizon -- \
  --horizon H2 \
  --next-horizon H3 \
  --evidence-dir evidence \
  --horizon-status-file docs/HORIZON_STATUS.json \
  --allow-horizon-mismatch
```

Behavior:
- runs `validate:horizon-closeout` (unless `--closeout-file` is explicitly provided)
- requires closeout payload `"pass": true`
- on success updates horizon status atomically:
  - `activeHorizon` advances to the next horizon
  - source horizon state becomes `completed`
  - next horizon state becomes `in_progress`
  - appends promotion history entries
- writes machine-readable promotion report:
  - `evidence/horizon-promotion-<source>-to-<next>-*.json`

Safety/testing flags:
- `--dry-run` evaluates and emits report without mutating `docs/HORIZON_STATUS.json`
- `--allow-inactive-source-horizon` permits replay/promotion against non-active horizons (CI/backfill only)
- `--allow-horizon-mismatch` forwards to closeout gate for controlled non-default promotion target checks
