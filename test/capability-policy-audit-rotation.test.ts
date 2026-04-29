import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  enforceDispatchAuditRetention,
  listDispatchAuditRotatedFiles,
  maybeRotateAppendOnlyJsonlAuditLog,
} from "../src/runtime/audit-log-rotation.js";
import { appendCapabilityPolicyAuditLog } from "../src/runtime/capability-policy-audit-log.js";

describe("capability policy audit JSONL rotation", () => {
  const tmpRoot = path.join(process.cwd(), "tmp-test-cap-policy-audit-rotation");

  beforeEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
    await mkdir(tmpRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("appendCapabilityPolicyAuditLog rotates before append when rotation maxBytes set", async () => {
    const logPath = path.join(tmpRoot, "cap-policy.jsonl");
    const filler = `${JSON.stringify({ x: "y".repeat(400) })}\n`;
    await writeFile(logPath, filler.repeat(4), "utf8");

    await appendCapabilityPolicyAuditLog(
      logPath,
      {
        recordedAtIso: new Date().toISOString(),
        traceId: "t-rot",
        capabilityId: "check_status",
        lane: "eve",
        chatId: "1",
        messageId: "2",
        allowed: true,
        policyReason: "allowed_by_default_policy",
      },
      { rotation: { maxBytes: 1200, retainCount: 3 } },
    );

    const rotated = await listDispatchAuditRotatedFiles(logPath);
    expect(rotated.length).toBe(1);
    const active = await readFile(logPath, "utf8");
    const lines = active.trim().split("\n").filter(Boolean);
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({ traceId: "t-rot" });
  });

  it("maybeRotateAppendOnlyJsonlAuditLog aliases dispatch rotate behavior", async () => {
    const logPath = path.join(tmpRoot, "alias.jsonl");
    await writeFile(logPath, `${"z".repeat(500)}\n`.repeat(4), "utf8");
    const r = await maybeRotateAppendOnlyJsonlAuditLog(logPath, { maxBytes: 1500, retainCount: 2 });
    expect(r.rotated).toBe(true);
    const archives = await listDispatchAuditRotatedFiles(logPath);
    expect(archives.length).toBe(1);
    const removed = await enforceDispatchAuditRetention(logPath, 2);
    expect(Array.isArray(removed)).toBe(true);
  });
});
