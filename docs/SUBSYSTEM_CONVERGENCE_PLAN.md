# Subsystem Convergence Plan

## Scope

Unify these subsystem ownership domains into merged runtime modules:

1. Ingress/Gateway
2. Runtime Policy
3. Memory
4. Skills/Tools
5. Control Plane

## Phased Ownership Transfer

### Phase 1: Gateway Convergence
- Keep existing Telegram ingress handler.
- Route all ingress through `dispatchUnifiedMessage`.
- Preserve Eve behavior for non-migrated flows.

### Phase 2: Runtime Policy Convergence
- Move routing, fallback, and fail-closed controls to unified policy config.
- Keep Eve shell scripts as compatibility layer.

### Phase 3: Memory Convergence
- Introduce a `UnifiedMemoryStore` interface.
- Build Eve and Hermes memory adapters.
- Route reads/writes through shared store API.

### Phase 4: Skills and Tools Convergence
- Create one shared capability registry.
- Register Eve command wrappers and Hermes tools into a single catalog.

### Phase 5: Control Plane Convergence
- Consolidate env/config schema.
- Provide compatibility shims for legacy env variable names.
- Cut legacy direct runtime entry points after parity testing.

## Exit Criteria

- No production message path requires direct legacy router invocation.
- One policy engine determines lane and fallback behavior.
- One canonical dispatch state schema is emitted for all requests.
