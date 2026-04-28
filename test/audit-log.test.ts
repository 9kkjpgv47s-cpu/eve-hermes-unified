import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appendDispatchAuditLog } from "../src/runtime/audit-log.js";
import type { UnifiedDispatchResult } from "../src/contracts/types.js";

function minimalResult(overrides?: Partial<UnifiedDispatchResult>): UnifiedDispatchResult {
  const base: UnifiedDispatchResult = {
    envelope: {
      traceId: "t-1",
      channel: "telegram",
      chatId: "1",
      messageId: "1",
      receivedAtIso: "2026-01-01T00:00:00Z",
      text: "hi",
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
      runtimeUsed: "test",
      runId: "r1",
      elapsedMs: 1,
      failureClass: "none",
      sourceLane: "eve",
      sourceChatId: "1",
      sourceMessageId: "1",
      traceId: "t-1",
    },
    response: {
      consumed: true,
      responseText: "ok",
      failureClass: "none",
      laneUsed: "eve",
      traceId: "t-1",
    },
  };
  return { ...base, ...overrides, envelope: { ...base.envelope, ...overrides?.envelope } };
}

describe("appendDispatchAuditLog", () => {
  it("writes tenant-partitioned files when tenantPartition is true and tenantId is set", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "audit-partition-"));
    const basePath = path.join(dir, "dispatch-audit.jsonl");
    try {
      await appendDispatchAuditLog(
        basePath,
        minimalResult({
          envelope: {
            traceId: "t-a",
            channel: "telegram",
            chatId: "1",
            messageId: "1",
            receivedAtIso: "2026-01-01T00:00:00Z",
            text: "hi",
            tenantId: "Acme Corp",
          },
        }),
        { tenantPartition: true },
      );
      const files = await readdir(dir);
      const tenantFile = files.find((f) => f.includes("tenant-acme_corp"));
      expect(tenantFile).toBeDefined();
      const raw = await readFile(path.join(dir, tenantFile!), "utf8");
      expect(raw).toContain("\"traceId\":\"t-a\"");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rotates active log when maxBytesBeforeRotate exceeded", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "audit-rotate-"));
    const basePath = path.join(dir, "audit.jsonl");
    try {
      const filler = "x".repeat(500);
      await writeFile(basePath, `${filler}\n`, "utf8");
      await appendDispatchAuditLog(basePath, minimalResult({ envelope: { ...minimalResult().envelope, traceId: "after-rotate" } }), {
        maxBytesBeforeRotate: 400,
      });
      const files = await readdir(dir);
      expect(files.some((f) => f.startsWith("audit.jsonl.rotated-"))).toBe(true);
      const active = await readFile(basePath, "utf8");
      expect(active).toContain("after-rotate");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
