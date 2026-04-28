import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
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
    routing: { primaryLane: "eve", fallbackLane: "none", reason: "test", policyVersion: "v1", failClosed: true },
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
    await appendDispatchAuditLog(logPath, minimalResult("t1"), { maxBytesBeforeRotate: 0, retainBytesAfterRotate: 0 });
    const text = await readFile(logPath, "utf8");
    expect(text.split("\n").filter(Boolean)).toHaveLength(1);
    const parsed = JSON.parse(text.trim().split("\n")[0]!) as { auditSchemaVersion?: number; tenantId?: unknown };
    expect(parsed.auditSchemaVersion).toBe(2);
    expect(parsed.tenantId).toBeNull();
    await rm(dir, { recursive: true, force: true });
  });

  it("rotates when file exceeds max bytes and keeps tail in primary log", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "audit-rot-b-"));
    const logPath = path.join(dir, "audit.jsonl");
    const filler = `${"x".repeat(500)}\n`;
    await writeFile(logPath, filler.repeat(20), "utf8");
    const before = await stat(logPath);
    expect(before.size).toBeGreaterThan(4000);

    await appendDispatchAuditLog(logPath, minimalResult("after-rotate"), {
      maxBytesBeforeRotate: 4000,
      retainBytesAfterRotate: 2000,
    });

    const after = await stat(logPath);
    expect(after.size).toBeLessThanOrEqual(5000);
    const rotated = await stat(`${logPath}.1`);
    expect(rotated.size).toBe(before.size);

    const primary = await readFile(logPath, "utf8");
    const lines = primary.split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const last = JSON.parse(lines[lines.length - 1]!) as {
      traceId: string;
      auditSchemaVersion?: number;
      tenantId?: unknown;
    };
    expect(last.traceId).toBe("after-rotate");
    expect(last.auditSchemaVersion).toBe(2);
    expect(last.tenantId).toBeNull();

    await rm(dir, { recursive: true, force: true });
  });

  it("includes tenantId in audit record when envelope has tenant", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "audit-tenant-"));
    const logPath = path.join(dir, "audit.jsonl");
    const result = minimalResult("t-tenant");
    result.envelope.tenantId = "acme";
    await appendDispatchAuditLog(logPath, result, { maxBytesBeforeRotate: 0, retainBytesAfterRotate: 0 });
    const parsed = JSON.parse((await readFile(logPath, "utf8")).trim().split("\n")[0]!) as {
      auditSchemaVersion?: number;
      tenantId?: string;
    };
    expect(parsed.auditSchemaVersion).toBe(2);
    expect(parsed.tenantId).toBe("acme");
    await rm(dir, { recursive: true, force: true });
  });
});
