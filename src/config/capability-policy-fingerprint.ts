import type { CapabilityPolicyConfig } from "../runtime/capability-policy.js";

function sortedKeys<T extends Record<string, unknown>>(obj: T): string[] {
  return Object.keys(obj).sort();
}

/**
 * Deterministic serialization for hashing / audit snapshots (sorted keys and lists).
 */
export function stableCapabilityPolicyJson(config: CapabilityPolicyConfig): string {
  const allowChats = sortedKeys(config.allowCapabilityChats as Record<string, unknown>).reduce<
    Record<string, string[]>
  >((acc, key) => {
    acc[key] = [...(config.allowCapabilityChats[key] ?? [])].map((s) => s.trim()).filter(Boolean).sort();
    return acc;
  }, {});
  const denyChats = sortedKeys(config.denyCapabilityChats as Record<string, unknown>).reduce<
    Record<string, string[]>
  >((acc, key) => {
    acc[key] = [...(config.denyCapabilityChats[key] ?? [])].map((s) => s.trim()).filter(Boolean).sort();
    return acc;
  }, {});

  return JSON.stringify({
    defaultMode: config.defaultMode,
    allowCapabilities: [...config.allowCapabilities].map((s) => s.trim().toLowerCase()).filter(Boolean).sort(),
    denyCapabilities: [...config.denyCapabilities].map((s) => s.trim().toLowerCase()).filter(Boolean).sort(),
    allowedChatIds: [...config.allowedChatIds].map((s) => s.trim()).filter(Boolean).sort(),
    deniedChatIds: [...config.deniedChatIds].map((s) => s.trim()).filter(Boolean).sort(),
    allowCapabilityChats: allowChats,
    denyCapabilityChats: denyChats,
  });
}
