# agent.md (Cloud Agent Handoff)

Use this lowercase file as a fast handoff entrypoint when swapping to another high-output cloud agent.

## Objective

Continue long-horizon convergence work for Eve/Hermes with strict fail-closed safety, rollback capability, deterministic routing, and machine-verifiable evidence.

## Current State Snapshot

- Active horizon: `H2` (`docs/HORIZON_STATUS.json`); **H4 ingress slice** landed (see `h4-action-1`–`h4-action-3` in horizon status).
- Latest slice:
  - **Extended legacy scan:** `scripts/scan-legacy-dispatch-entrypoints.sh` checks `src/`, `scripts/*.sh|*.mjs` (with harness allowlist), and `docs/**/*.md` for forbidden legacy shell strings.
  - **Contract doc:** `docs/H4_UNIFIED_DISPATCH_CONTRACT.md`.
  - **`npm run scan:legacy-dispatch-entrypoints`** runs after build inside `npm run validate:all`.
  - **Default config literals** in `unified-runtime-config.ts` split so CI grep does not false-positive on source defaults.

## What Was Just Completed

1. **H4 ingress gate:** extended `scan-legacy-dispatch-entrypoints.sh` to scripts and docs, added harness allowlist, wired `npm run scan:legacy-dispatch-entrypoints` into `validate:all`.
2. **Documentation:** `docs/H4_UNIFIED_DISPATCH_CONTRACT.md` plus `.env.example` / architecture wording that avoids forbidden literal shell examples in tracked files.
3. **Tests:** `test/scan-legacy-dispatch-entrypoints.test.ts` exercises pass-on-repo and fail-on-synthetic violation; `unified-runtime-config` test uses split Hermes argv string for the same hygiene rules.

## Read Order (Zero-Context Startup)

1. `README.md`
2. `AGENTS.md`
3. `AGENT.md`
4. `docs/CLOUD_AGENT_HANDOFF.md`
5. `docs/H4_UNIFIED_DISPATCH_CONTRACT.md`
6. `docs/NEXT_LONG_HORIZON_ACTION_PLAN.md`
7. `docs/HORIZON_STATUS.json`

## Immediate Next High-Output Targets

1. **H4 continuation:** remove remaining compatibility shims only after parity evidence; consider stricter doc rules if operators need copy-paste runbooks audited.
2. **H2 closeout (when ready):** operator evidence + `validate:h2-closeout` / promotion flows.
3. **Horizon-neutral closeout taxonomy** (remaining H2-prefixed labels outside drill suite, if any).

## Validation Pack

```bash
npm run check
npm test
npm run scan:legacy-dispatch-entrypoints
npm run validate:all
```

Targeted suites when touching promotion/closeout paths:

```bash
npm test -- test/h2-closeout-runner-script.test.ts test/promote-horizon-script.test.ts test/h2-promotion-runner-script.test.ts test/horizon-closeout-validation.test.ts
```

## Execution Guardrails

- Never weaken rollback or fail-closed logic.
- Keep deterministic artifact/evidence selection.
- Keep outputs machine-readable JSON with explicit pass/fail signals.
- Any policy/routing behavior change must include tests + evidence updates.

## Delivery Checklist Per Iteration

- Implement meaningful increment (not docs-only unless requested).
- Add/adjust tests.
- Run validation commands.
- Update handoff docs (`agent.md` / `AGENT.md` / `docs/CLOUD_AGENT_HANDOFF.md`) as needed.
- Commit, push, and update PR.
