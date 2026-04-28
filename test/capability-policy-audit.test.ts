import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appendCapabilityPolicyDenialAudit, appendCapabilityPolicySnapshotIfChanged } from "../src/runtime/capability-policy-audit.js";
import { stableCapabilityPolicyJson } from "../src/config/capability-policy-fingerprint.js";
import type { CapabilityPolicyConfig } from "../src/runtime/capability-policy.js";

describe("appendCapabilityPolicyDenialAudit", () => {
  it("writes append-only JSONL records", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cap-policy-audit-"));
    const logPath = path.join(dir, "policy.jsonl");
    try {
      await appendCapabilityPolicyDenialAudit(logPath, {
        capabilityId: "summarize_state",
        lane: "hermes",
        chatId: "9",
        reason: "chat_not_in_capability_allowlist",
      });
      const raw = await readFile(logPath, "utf8");
      const line = raw.trim().split("\n").pop();
      expect(line).toBeDefined();
      const rec = JSON.parse(line!) as { kind: string; capabilityId: string };
      expect(rec.kind).toBe("capability_policy_denial");
      expect(rec.capabilityId).toBe("summarize_state");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("appends policy snapshot only when fingerprint changes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cap-policy-snap-"));
    const logPath = path.join(dir, "policy.jsonl");
    try {
      const base: CapabilityPolicyConfig = {
        defaultMode: "deny",
        allowCapabilities: ["a"],
        denyCapabilities: [],
        allowedChatIds: [],
        deniedChatIds: [],
        allowCapabilityChats: {},
        denyCapabilityChats: {},
      };
      await appendCapabilityPolicySnapshotIfChanged(logPath, stableCapabilityPolicyJson(base));
      await appendCapabilityPolicySnapshotIfChanged(logPath, stableCapabilityPolicyJson(base));
      const raw = await readFile(logPath, "utf8");
      const snapshots = raw
        .trim()
        .split("\n")
        .filter((line) => line.includes("capability_policy_config_snapshot"));
      expect(snapshots).toHaveLength(1);

      const next = { ...base, allowCapabilities: ["a", "b"] };
      await appendCapabilityPolicySnapshotIfChanged(logPath, stableCapabilityPolicyJson(next));
      const raw2 = await readFile(logPath, "utf8");
      const snapshots2 = raw2
        .trim()
        .split("\n")
        .filter((line) => line.includes("capability_policy_config_snapshot"));
      expect(snapshots2).toHaveLength(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
