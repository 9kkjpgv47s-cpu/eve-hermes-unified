import { describe, expect, it } from "vitest";
import { capabilityPolicyFingerprintSha256, stableCapabilityPolicyJson } from "../src/config/capability-policy-fingerprint.js";
import type { CapabilityPolicyConfig } from "../src/runtime/capability-policy.js";

describe("capabilityPolicyFingerprintSha256", () => {
  it("is stable across key order and list order", () => {
    const a: CapabilityPolicyConfig = {
      defaultMode: "deny",
      allowCapabilities: ["b", "a"],
      denyCapabilities: ["z"],
      allowedChatIds: ["2", "1"],
      deniedChatIds: [],
      allowCapabilityChats: { cap1: ["y", "x"] },
      denyCapabilityChats: {},
    };
    const b: CapabilityPolicyConfig = {
      defaultMode: "deny",
      allowCapabilities: ["a", "b"],
      denyCapabilities: ["z"],
      allowedChatIds: ["1", "2"],
      deniedChatIds: [],
      allowCapabilityChats: { cap1: ["x", "y"] },
      denyCapabilityChats: {},
    };
    expect(stableCapabilityPolicyJson(a)).toBe(stableCapabilityPolicyJson(b));
    expect(capabilityPolicyFingerprintSha256(a)).toBe(capabilityPolicyFingerprintSha256(b));
  });

  it("changes when policy content changes", () => {
    const base: CapabilityPolicyConfig = {
      defaultMode: "allow",
      allowCapabilities: [],
      denyCapabilities: [],
      allowedChatIds: [],
      deniedChatIds: [],
      allowCapabilityChats: {},
      denyCapabilityChats: {},
    };
    const changed = { ...base, defaultMode: "deny" as const };
    expect(capabilityPolicyFingerprintSha256(base)).not.toBe(capabilityPolicyFingerprintSha256(changed));
  });
});
