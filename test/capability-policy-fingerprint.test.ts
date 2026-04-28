import { describe, expect, it } from "vitest";
import { stableCapabilityPolicyJson } from "../src/config/capability-policy-fingerprint.js";
import type { CapabilityPolicyConfig } from "../src/runtime/capability-policy.js";

describe("stableCapabilityPolicyJson", () => {
  it("is stable under key reorder", () => {
    const a: CapabilityPolicyConfig = {
      defaultMode: "deny",
      allowCapabilities: ["z", "a"],
      denyCapabilities: ["b"],
      allowedChatIds: ["2", "1"],
      deniedChatIds: [],
      allowCapabilityChats: { x: ["c", "b"] },
      denyCapabilityChats: {},
    };
    const b: CapabilityPolicyConfig = {
      defaultMode: "deny",
      allowCapabilities: ["a", "z"],
      denyCapabilities: ["b"],
      allowedChatIds: ["1", "2"],
      deniedChatIds: [],
      allowCapabilityChats: { x: ["b", "c"] },
      denyCapabilityChats: {},
    };
    expect(stableCapabilityPolicyJson(a)).toBe(stableCapabilityPolicyJson(b));
  });
});
