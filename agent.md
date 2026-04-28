# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- Active horizon: `H2` (`docs/HORIZON_STATUS.json`); H3 workstreams advance in code ahead of horizon promotion.
- Branch: `cursor/h3-wal-policy-audit-prune-cc15` (large H3 durability slice).

## What Was Just Completed (H3 chunk)

1. **File memory WAL** — optional `UNIFIED_MEMORY_JOURNAL_PATH`: append-only journal, replayed after JSON snapshot on load, cleared after atomic persist (`FileUnifiedMemoryStore`).
2. **Dispatch audit lifecycle** — rotation (`UNIFIED_AUDIT_LOG_ROTATION_*`), numbered backups `.1`…`.N`, prune when `UNIFIED_AUDIT_LOG_ROTATION_RETAIN_BACKUPS` > 0.
3. **Capability policy denial audit** — optional `UNIFIED_CAPABILITY_POLICY_AUDIT_PATH` + `appendCapabilityPolicyDenialAudit`; wired via `onPolicyDenial` in CLI.
4. **Capability execution timeout** — `UNIFIED_CAPABILITY_EXECUTION_TIMEOUT_MS` (capped at 24h); `Promise.race` on executor completion.
5. **Preflight** — writable checks for memory journal and policy audit paths.
6. **Vitest `globalSetup`** — creates `./evidence` for script integration tests.

## Read Order (Zero-Context Startup)

1. `README.md`
2. `AGENTS.md`
3. `AGENT.md`
4. `docs/CLOUD_AGENT_HANDOFF.md` (includes **H3 durability controls** section)
5. `docs/NEXT_LONG_HORIZON_ACTION_PLAN.md`
6. `docs/HORIZON_STATUS.json`

## Immediate Next High-Output Targets

1. Optional **dual-write verify** mode for memory (compare journal vs snapshot in tests / ops).
2. **Lane subprocess cancellation** on capability timeout (harder; document limits today).
3. Continue **horizon-neutral** closeout taxonomy where H2-prefixed IDs remain.
4. Keep `npm run check && npm test && npm run validate:all` green before merge.

## Validation Pack

```bash
npm run check
npm test
npm run validate:all
```

## Guardrails

- Never weaken rollback or fail-closed orchestration gates.
- Policy audit failures must not block denial responses (best-effort append).
- Memory journal replay must tolerate partial lines (skip invalid JSON lines).

## Delivery Checklist Per Iteration

- Implement + tests + docs for operator-visible behavior.
- Commit, push, open/update PR.
