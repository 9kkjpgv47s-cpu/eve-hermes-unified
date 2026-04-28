import type { UnifiedMessageEnvelope } from "../contracts/types.js";

/** Resolves tenant from metadata.tenantId (wins) or envelope.tenantId. */
export function resolveEnvelopeTenantId(envelope: UnifiedMessageEnvelope): string {
  const fromMeta = envelope.metadata?.tenantId?.trim();
  if (fromMeta && fromMeta.length > 0) {
    return fromMeta;
  }
  return envelope.tenantId?.trim() ?? "";
}
