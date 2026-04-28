import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { UnifiedDispatchResult } from "../src/contracts/types.js";
import { appendDispatchAuditLog } from "../src/runtime/audit-log.js";
import { rotateLogFileIfNeeded } from "../src/runtime/audit-log-rotate.js";

function minimalResult(traceId: string): UnifiedDispatchResult {
  return {
    envelope: {
      traceId,
      channel: "telegram",
      chatId: "1",
      messageId: "1",
      receivedAtIso: new Date().toISOString(),
      text: "hi",
    },
    routing: {
      primaryLane: "hermes",
      fallbackLane: "none",
      reason: "test",
      policyVersion: "v1",
      failClosed: true,
    },
    primaryState: {
      status: "pass",
      reason: "ok",
      runtimeUsed: "stub",
      runId: "r1",
      elapsedMs: 1,
      failureClass: "none",
      sourceLane: "hermes",
      sourceChatId: "1",
      sourceMessageId: "1",
      traceId,
    },
    response: {
      consumed: true,
      responseText: "ok",
      failureClass: "none",
      laneUsed: "hermes",
      traceId,
    },
  };
}

describe("rotateLogFileIfNeeded", () => {
  it("renames chain when log exceeds maxBytes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "audit-rotate-"));
    const logPath = path.join(dir, "audit.jsonl");
    await writeFile(logPath, "x".repeat(100), "utf8");
    await rotateLogFileIfNeeded(logPath, 50, 3);
    expect((await stat(logPath)).size).toBe(0);
    expect((await readFile(`${logPath}.1`, "utf8")).length).toBe(100);
  });
});

describe("appendDispatchAuditLog", () => {
  it("rotates before append when maxBytesBeforeRotate is set", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "audit-append-"));
    const logPath = path.join(dir, "dispatch.jsonl");
    await writeFile(logPath, "y".repeat(200), "utf8");

    await appendDispatchAuditLog(logPath, minimalResult("t-rotate"), {
      maxBytesBeforeRotate: 100,
      maxRotatedFiles: 5,
    });

    const active = await readFile(logPath, "utf8");
    expect(active.trim().length).toBeGreaterThan(0);
    expect(active).toContain("t-rotate");
    expect((await readFile(`${logPath}.1`, "utf8")).length).toBe(200);
  });
});
