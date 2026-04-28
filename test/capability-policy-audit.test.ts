import { describe, expect, it } from "vitest";
import type { CapabilityPolicyConfig } from "../src/runtime/capability-policy.js";
import {
  capabilityPolicyFingerprint,
  snapshotCapabilityPolicy,
} from "../src/runtime/capability-policy-audit.js";

describe("capabilityPolicyFingerprint", () => {
  it("is stable under list reordering and capability id casing", () => {
    const a: CapabilityPolicyConfig = {
      defaultMode: "deny",
      allowCapabilities: ["Check_Status", "summarize_state"],
      denyCapabilities: ["bad_cap"],
      allowedChatIds: ["200", "100"],
      deniedChatIds: [],
      allowCapabilityChats: {},
      denyCapabilityChats: {},
    };
    const b: CapabilityPolicyConfig = {
      defaultMode: "deny",
      allowCapabilities: ["summarize_state", "check_status"],
      denyCapabilities: ["bad_cap"],
      allowedChatIds: ["100", "200"],
      deniedChatIds: [],
      allowCapabilityChats: {},
      denyCapabilityChats: {},
    };
    expect(capabilityPolicyFingerprint(a)).toBe(capabilityPolicyFingerprint(b));
  });

  it("normalizes capability chat map keys", () => {
    const a: CapabilityPolicyConfig = {
      defaultMode: "allow",
      allowCapabilities: [],
      denyCapabilities: [],
      allowedChatIds: [],
      deniedChatIds: [],
      allowCapabilityChats: { Check_Status: ["1", "2"] },
      denyCapabilityChats: {},
    };
    const b: CapabilityPolicyConfig = {
      defaultMode: "allow",
      allowCapabilities: [],
      denyCapabilities: [],
      allowedChatIds: [],
      deniedChatIds: [],
      allowCapabilityChats: { check_status: ["2", "1"] },
      denyCapabilityChats: {},
    };
    expect(snapshotCapabilityPolicy(a)).toEqual(snapshotCapabilityPolicy(b));
  });
});
