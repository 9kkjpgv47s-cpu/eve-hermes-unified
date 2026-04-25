# Eve-Hermes Unified

Cloud-agent-first integration repository that converges Eve and Hermes into one operating system over phased dual-lane routing.

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
cd "/Users/dominiceasterling/eve-hermes-unified"
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
