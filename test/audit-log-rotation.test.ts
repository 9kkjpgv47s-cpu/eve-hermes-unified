import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";
import type { UnifiedDispatchResult } from "../src/contracts/types.js";
import { appendDispatchAuditLog } from "../src/runtime/audit-log.js";

function minimalResult(traceId: string): UnifiedDispatchResult {
  return {
    envelope: {
      traceId,
      channel: "telegram",
      chatId: "1",
      messageId: "1",
      receivedAtIso: new Date().toISOString(),
      text: "x",
    },
    routing: {
      primaryLane: "eve",
      fallbackLane: "none",
      reason: "test",
      policyVersion: "v1",
      failClosed: true,
    },
    primaryState: {
      status: "pass",
      reason: "ok",
      runtimeUsed: "eve",
      runId: "r1",
      elapsedMs: 1,
      failureClass: "none",
      sourceLane: "eve",
      sourceChatId: "1",
      sourceMessageId: "1",
      traceId,
    },
    response: {
      consumed: true,
      responseText: "ok",
      failureClass: "none",
      laneUsed: "eve",
      traceId,
    },
  };
}

describe("appendDispatchAuditLog rotation", () => {
  it("appends without rotation when max bytes is zero", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "audit-rot-a-"));
    const logPath = path.join(dir, "audit.jsonl");
    await appendDispatchAuditLog(logPath, minimalResult("t1"), { maxBytesBeforeRotate: 0 });
    const text = await readFile(logPath, "utf8");
    expect(text.split("\n").filter(Boolean)).toHaveLength(1);
    const parsed = JSON.parse(text.trim().split("\n")[0]!) as { auditSchemaVersion?: number };
    expect(parsed.auditSchemaVersion).toBe(1);
    await rm(dir, { recursive: true, force: true });
  });

  it("rotates when file exceeds max bytes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "audit-rot-one-"));
    const logPath = path.join(dir, "audit.jsonl");
    try {
      await mkdir(dir, { recursive: true });
      const filler = `${"y".repeat(500)}\n`;
      await writeFile(logPath, filler.repeat(10), "utf8");

      await appendDispatchAuditLog(logPath, minimalResult("after-rotate"), {
        maxBytesBeforeRotate: 4000,
        retainBytesAfterRotate: 800,
        rotateRetainBackupCount: 3,
      });

      const rotated = await stat(`${logPath}.1`);
      expect(rotated.size).toBeGreaterThan(4000);
      const primary = await readFile(logPath, "utf8");
      expect(primary).toContain("after-rotate");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
