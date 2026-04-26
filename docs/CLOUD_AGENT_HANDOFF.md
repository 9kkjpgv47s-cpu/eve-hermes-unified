# Cloud Agent Handoff

Use this document when one cloud agent hands execution to another. The objective is to preserve context in-repo and avoid hidden assumptions.

## Startup Procedure for a Fresh Agent

1. Read these files in order:
   - `README.md` ("Start Here (Cloud Agents)" section)
   - `AGENTS.md`
   - `docs/PROJECT_VISION.md`
   - `docs/MASTER_EXECUTION_CHECKLIST.md`
2. Install and verify:
   - `npm install`
   - `npm run check`
   - `npm test`
3. Confirm runtime command compiles and runs:
   - `npm run dispatch -- --text "startup verification" --chat-id 1 --message-id 1`

## Baseline Status Fields to Record

When taking over, capture and report:

- Current branch name and latest commit
- Current phase from `docs/MASTER_EXECUTION_CHECKLIST.md`
- Whether contracts and tests pass
- Whether rollout scripts are operational in this environment
- Any blockers (missing source paths, unavailable dispatch scripts, or missing secrets)

## Required PR Deliverables

Every PR should include:

- What phase/checklist gate the work advances
- Files changed
- Commands executed and outcomes
- Remaining risks or explicit non-goals

## Operator-Safe Constraints

- Never remove rollback controls.
- Keep fail-closed mode supported.
- Preserve canonical `traceId` continuity from envelope to response.
- Keep explicit lane directives (`@cursor`, `@hermes`) deterministic.

## Cutover and Rollback Commands

Stage:

```bash
npm run cutover:stage -- canary
```

Rollback:

```bash
npm run cutover:rollback
```

## Evidence Expectations

Before marking a phase complete, include artifacts from:

- `npm run check`
- `npm test`
- `npm run validate:failure-injection`
- `npm run validate:soak`
- `UNIFIED_EVIDENCE_REQUIRE_FAILURE_SCENARIOS=1 npm run validate:evidence-summary`
- `npm run validate:regression-eve-primary`
- `npm run validate:cutover-readiness`
- `npm run validate:release-readiness`

Keep evidence under `evidence/` when possible so subsequent agents can inspect prior runs.
