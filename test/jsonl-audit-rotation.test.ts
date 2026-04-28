import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { maybeRotateJsonlLogInPlace } from "../src/runtime/jsonl-audit-rotation.js";

describe("maybeRotateJsonlLogInPlace", () => {
  it("no-ops when maxBytes is zero", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "jsonl-rot-"));
    const logPath = path.join(dir, "a.jsonl");
    try {
      await writeFile(logPath, "x\n", "utf8");
      await maybeRotateJsonlLogInPlace(logPath, 0, 100);
      expect((await stat(logPath)).size).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rotates when over threshold and keeps line-aligned tail in primary", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "jsonl-rot-b-"));
    const logPath = path.join(dir, "a.jsonl");
    try {
      const filler = `${"x".repeat(500)}\n`;
      await writeFile(logPath, filler.repeat(20), "utf8");
      const before = await stat(logPath);
      expect(before.size).toBeGreaterThan(4000);

      await maybeRotateJsonlLogInPlace(logPath, 4000, 2000);

      const after = await stat(logPath);
      expect(after.size).toBeLessThanOrEqual(5000);
      const rotated = await stat(`${logPath}.1`);
      expect(rotated.size).toBe(before.size);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
