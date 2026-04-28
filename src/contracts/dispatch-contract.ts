import type { UnifiedDispatchResult } from "./types.js";

/**
 * Versioned unified dispatch contract (H4).
 * Bump when envelope/routing/dispatch/response invariants change for downstream consumers.
 */
export const UNIFIED_DISPATCH_CONTRACT_VERSION = "2026-04-28-h4-v1";

/** Human-readable reference for operators and CI evidence. */
export const UNIFIED_DISPATCH_CONTRACT_SCHEMA_REF = "docs/H4_UNIFIED_DISPATCH_CONTRACT.md";

export function stampUnifiedDispatchContract(result: UnifiedDispatchResult): UnifiedDispatchResult {
  return {
    ...result,
    contractVersion: UNIFIED_DISPATCH_CONTRACT_VERSION,
    contractSchemaRef: UNIFIED_DISPATCH_CONTRACT_SCHEMA_REF,
  };
}
