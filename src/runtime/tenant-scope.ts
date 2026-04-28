import type { UnifiedMessageEnvelope } from "../contracts/types.js";

/** Resolves tenant from metadata.tenantId (wins) or envelope.tenantId. */
export function resolveEnvelopeTenantId(envelope: UnifiedMessageEnvelope): string {
  const fromMeta = envelope.metadata?.tenantId?.trim();
  if (fromMeta && fromMeta.length > 0) {
    return fromMeta;
  }
  return envelope.tenantId?.trim() ?? "";
}

/** Returns normalized tenant id or undefined if invalid (empty, too long, path chars). */
export function normalizeValidatedTenantId(raw: string): string | undefined {
  const t = raw.trim();
  if (!t || t.length > 128) {
    return undefined;
  }
  if (t.includes("/") || t.includes("\\")) {
    return undefined;
  }
  return t;
}
