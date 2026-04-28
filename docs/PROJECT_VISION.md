# Project Vision

## Mission

Build a unified Eve/Hermes operating runtime that is safe for production cutover, observable by default, and operable by cloud agents without additional chat context.

## Core Doctrine

1. **Safety first**: Eve-safe rollback is always one command away.
2. **One control plane**: one routing policy and one canonical dispatch state model.
3. **Trace continuity**: every request has a canonical `traceId` from ingress to final response.
4. **Deterministic execution**: all lane decisions and fallback behavior are explicit and testable.
5. **Agent-ready repository**: execution instructions and handoff documents live in files, not in chat.

## What "Done" Looks Like

- A single unified runtime path handles all ingress traffic.
- Routing decisions are reproducible and covered by tests.
- Failure classes are canonicalized and never unclassified.
- Validation artifacts are generated in `evidence/`.
- Production cutover and rollback are documented and rehearsed.

## Non-Negotiables

- Do not break Eve-safe mode.
- Do not bypass canonical contracts in `src/contracts/`.
- Do not add hidden behavior that cannot be traced via output JSON and logs.
