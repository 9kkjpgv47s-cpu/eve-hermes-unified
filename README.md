# Eve-Hermes Unified

Cloud-agent-first integration repository that converges Eve and Hermes into one operating system over phased dual-lane routing.

## Start Here (Cloud Agents)

Use this ordered reading path before touching code:

1. `AGENTS.md`
2. `docs/PROJECT_VISION.md`
3. `docs/MASTER_EXECUTION_CHECKLIST.md`
4. `docs/CLOUD_AGENT_HANDOFF.md`
5. `docs/UNIFIED_ARCHITECTURE_SPEC.md`
6. `docs/SUBSYSTEM_CONVERGENCE_PLAN.md`
7. `docs/VALIDATION_HARDENING_MATRIX.md`
8. `docs/PRODUCTION_CUTOVER_RUNBOOK.md`

Validation command set:

```bash
npm run check
npm test
npm run build
npm run validate:failure-injection
npm run validate:soak
npm run validate:evidence-summary
```

## Repository Goals

- Keep current Eve production behavior safe while converging to one runtime.
- Treat Eve and Hermes as pinned source inputs.
- Route each message through one policy engine with structured trace and failure classification.

## Source Inputs

- Eve source: `openclaw` (local path or git remote, pinned by commit).
- Hermes source: `NousResearch/hermes-agent` (pinned by commit).

Use `scripts/bootstrap-sources.sh` for first import and `scripts/sync-sources.sh` for repeatable updates.

## Quick Start

```bash
cd /workspace
npm install
cp .env.example .env
npm run bootstrap:sources
npm run check
npm test
```

## Dispatch CLI

Run one unified-dispatch request with explicit message envelope:

```bash
npm run dispatch -- --text "check project status" --chat-id 123 --message-id 456
```

Key environment controls are in `.env.example`.
