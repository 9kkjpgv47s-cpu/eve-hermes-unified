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
