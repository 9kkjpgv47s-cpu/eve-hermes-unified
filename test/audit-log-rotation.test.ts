import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  enforceDispatchAuditRetention,
  listDispatchAuditRotatedFiles,
  maybeRotateDispatchAuditLog,
} from "../src/runtime/audit-log-rotation.js";

describe("dispatch audit log rotation", () => {
  const tmpRoot = path.join(process.cwd(), "tmp-test-audit-rotation");

  beforeEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
    await mkdir(tmpRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("maybeRotateDispatchAuditLog renames oversized active log and enforces retention", async () => {
    const logPath = path.join(tmpRoot, "dispatch-audit.jsonl");
    const filler = `${"x".repeat(500)}\n`;
    await writeFile(logPath, filler.repeat(4), "utf8");

    const first = await maybeRotateDispatchAuditLog(logPath, { maxBytes: 1500, retainCount: 2 });
    expect(first.rotated).toBe(true);
    expect(first.rotatedToPath).toMatch(/dispatch-audit\.jsonl\.\d+\.jsonl$/);

    const rotated = await listDispatchAuditRotatedFiles(logPath);
    expect(rotated.length).toBe(1);

    await writeFile(logPath, filler.repeat(4), "utf8");
    const second = await maybeRotateDispatchAuditLog(logPath, { maxBytes: 1500, retainCount: 2 });
    expect(second.rotated).toBe(true);
    const archivesAfter = await listDispatchAuditRotatedFiles(logPath);
    expect(archivesAfter.length).toBe(2);
  });

  it("does not rotate when under maxBytes", async () => {
    const logPath = path.join(tmpRoot, "small.jsonl");
    await writeFile(logPath, "a\n", "utf8");
    const r = await maybeRotateDispatchAuditLog(logPath, { maxBytes: 1000, retainCount: 3 });
    expect(r.rotated).toBe(false);
  });

  it("enforceDispatchAuditRetention removes oldest archives first", async () => {
    const logPath = path.join(tmpRoot, "audit.jsonl");
    await writeFile(logPath, "active\n", "utf8");
    const old = `${logPath}.111.jsonl`;
    const mid = `${logPath}.222.jsonl`;
    await writeFile(old, "old\n", "utf8");
    await writeFile(mid, "mid\n", "utf8");
    const removed = await enforceDispatchAuditRetention(logPath, 2);
    expect(removed).toContain(old);
    expect(removed.length).toBe(1);
    const kept = await listDispatchAuditRotatedFiles(logPath);
    expect(kept.map((p) => path.basename(p))).toContain(path.basename(mid));
  });

  it("append after rotate creates fresh active file", async () => {
    const logPath = path.join(tmpRoot, "append.jsonl");
    await writeFile(logPath, `${"y".repeat(2000)}\n`, "utf8");
    await maybeRotateDispatchAuditLog(logPath, { maxBytes: 100, retainCount: 5 });
    await writeFile(logPath, '{"ok":true}\n', { flag: "a" });
    const content = await readFile(logPath, "utf8");
    expect(content.trim()).toBe('{"ok":true}');
  });
});
