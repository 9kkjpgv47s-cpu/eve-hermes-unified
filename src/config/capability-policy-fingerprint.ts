import { createHash } from "node:crypto";
import type { CapabilityPolicyConfig } from "../runtime/capability-policy.js";

/** Stable JSON for hashing capability policy config (sorted keys, deterministic arrays). */
export function stableCapabilityPolicyJson(config: CapabilityPolicyConfig): string {
  const sortedMap = (m: Record<string, string[]>) =>
    Object.keys(m)
      .sort()
      .reduce<Record<string, string[]>>((acc, key) => {
        acc[key] = [...m[key]].map((s) => s.trim()).filter(Boolean).sort();
        return acc;
      }, {});

  const body = {
    defaultMode: config.defaultMode,
    allowCapabilities: [...config.allowCapabilities].map((s) => s.trim().toLowerCase()).filter(Boolean).sort(),
    denyCapabilities: [...config.denyCapabilities].map((s) => s.trim().toLowerCase()).filter(Boolean).sort(),
    allowedChatIds: [...config.allowedChatIds].map((s) => s.trim()).filter(Boolean).sort(),
    deniedChatIds: [...config.deniedChatIds].map((s) => s.trim()).filter(Boolean).sort(),
    allowCapabilityChats: sortedMap(config.allowCapabilityChats),
    denyCapabilityChats: sortedMap(config.denyCapabilityChats),
  };
  return JSON.stringify(body);
}

export function capabilityPolicyFingerprintSha256(config: CapabilityPolicyConfig): string {
  return createHash("sha256").update(stableCapabilityPolicyJson(config), "utf8").digest("hex");
}
