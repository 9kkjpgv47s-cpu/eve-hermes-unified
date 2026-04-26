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
