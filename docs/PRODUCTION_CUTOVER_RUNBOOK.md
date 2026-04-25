# Production Cutover Runbook

## Strategy

Perform staged rollout with live rollback capability.

### Stage A: Shadow
- Keep user responses from Eve lane.
- Evaluate Hermes lane output and parity in logs only.

### Stage B: Canary
- Route a small allowlist of chats through Hermes-primary policy.
- Keep fallback lane enabled.

### Stage C: Majority
- Expand Hermes-primary routing to majority traffic.
- Maintain rollback switch.

### Stage D: Full Cutover
- Route all traffic through unified merged runtime policy.
- Disable legacy direct path entry points.

## Rollback Switch

Set:

- `UNIFIED_ROUTER_DEFAULT_PRIMARY=eve`
- `UNIFIED_ROUTER_DEFAULT_FALLBACK=none`
- `UNIFIED_ROUTER_FAIL_CLOSED=1`

Then restart unified runtime.

## Operational Checks

- Confirm gateway health.
- Verify trace continuity for recent messages.
- Verify failure classes and response classes are expected.
- Confirm no unexpected lane drift.

## Emergency Actions

1. Trigger rollback switch.
2. Restart runtime.
3. Verify Eve-only message flow.
4. Capture incident evidence and route to remediation queue.
