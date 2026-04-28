import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendCapabilityPolicyDenialAudit,
  maybeAppendCapabilityPolicyConfigLoadedAudit,
} from "../src/runtime/capability-policy-audit.js";

describe("capability policy audit", () => {
  it("appends policy_denial line", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cap-policy-audit-"));
    const logPath = path.join(dir, "policy.jsonl");
    try {
      await appendCapabilityPolicyDenialAudit(logPath, {
        traceId: "t1",
        chatId: "c1",
        messageId: "m1",
        capabilityId: "status",
        lane: "eve",
        policyReason: "capability_policy_denied",
        policyFingerprintSha256: "a".repeat(64),
        envelope: {
          traceId: "t1",
          channel: "telegram",
          chatId: "c1",
          messageId: "m1",
          receivedAtIso: new Date().toISOString(),
          text: "@cap status",
          tenantId: "acme",
        },
      });
      const raw = await readFile(logPath, "utf8");
      const row = JSON.parse(raw.trim()) as {
        eventType: string;
        tenantId: string;
        auditSchemaVersion: number;
      };
      expect(row.eventType).toBe("policy_denial");
      expect(row.tenantId).toBe("acme");
      expect(row.auditSchemaVersion).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("maybeAppend writes policy_config_loaded once for same fingerprint", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cap-policy-load-"));
    const logPath = path.join(dir, "policy.jsonl");
    const fp = "a".repeat(64);
    try {
      await maybeAppendCapabilityPolicyConfigLoadedAudit(logPath, fp);
      await maybeAppendCapabilityPolicyConfigLoadedAudit(logPath, fp);
      const lines = (await readFile(logPath, "utf8")).trim().split("\n").filter(Boolean);
      expect(lines).toHaveLength(1);
      const row = JSON.parse(lines[0]!) as { eventType: string };
      expect(row.eventType).toBe("policy_config_loaded");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("maybeAppend appends when fingerprint differs from last loaded line", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cap-policy-load-2-"));
    const logPath = path.join(dir, "policy.jsonl");
    try {
      await writeFile(
        logPath,
        `${JSON.stringify({
          auditSchemaVersion: 1,
          eventType: "policy_config_loaded",
          recordedAtIso: new Date().toISOString(),
          policyFingerprintSha256: "b".repeat(64),
        })}\n`,
        "utf8",
      );
      await maybeAppendCapabilityPolicyConfigLoadedAudit(logPath, "c".repeat(64));
      const lines = (await readFile(logPath, "utf8")).trim().split("\n").filter(Boolean);
      expect(lines).toHaveLength(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rotates before append when maxBytes exceeded", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cap-policy-rot-"));
    const logPath = path.join(dir, "policy.jsonl");
    const fp = "a".repeat(64);
    try {
      const filler = `${"y".repeat(500)}\n`;
      await writeFile(logPath, filler.repeat(20), "utf8");
      const before = await stat(logPath);
      await appendCapabilityPolicyDenialAudit(
        logPath,
        {
          traceId: "t-rot",
          chatId: "1",
          messageId: "2",
          capabilityId: "status",
          lane: "eve",
          policyReason: "capability_policy_denied",
          policyFingerprintSha256: fp,
          envelope: {
            traceId: "t-rot",
            channel: "telegram",
            chatId: "1",
            messageId: "2",
            receivedAtIso: new Date().toISOString(),
            text: "@cap status",
          },
        },
        { maxBytesBeforeRotate: 4000, retainBytesAfterRotate: 2000 },
      );
      const afterPrimary = await stat(logPath);
      expect(afterPrimary.size).toBeLessThanOrEqual(5000);
      const rotated = await stat(`${logPath}.1`);
      expect(rotated.size).toBe(before.size);
      const tail = await readFile(logPath, "utf8");
      expect(tail.trim().split("\n").length).toBeGreaterThanOrEqual(1);
      const last = JSON.parse(tail.trim().split("\n").pop()!) as { eventType: string };
      expect(last.eventType).toBe("policy_denial");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
