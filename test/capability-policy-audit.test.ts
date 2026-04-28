import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appendCapabilityPolicyDenialAudit } from "../src/runtime/capability-policy-audit.js";

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
});
