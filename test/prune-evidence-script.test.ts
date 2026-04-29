import { mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

describe("prune-evidence.mjs", () => {
  it("deletes files older than ttl matching soak prefix", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "prune-ev-"));
    try {
      const oldPath = path.join(dir, "soak-old.jsonl");
      const newPath = path.join(dir, "soak-new.jsonl");
      const reportPath = path.join(dir, "prune-report.json");
      await writeFile(oldPath, "x\n", "utf8");
      await writeFile(newPath, "y\n", "utf8");
      const ancient = new Date("2020-01-01T00:00:00Z");
      await utimes(oldPath, ancient, ancient);

      const result = await runCommandWithTimeout(
        ["node", "scripts/prune-evidence.mjs", "--evidence-dir", dir, "--ttl-days", "7", "--prefixes", "soak-", "--out", reportPath],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(0);
      const payload = JSON.parse(await readFile(reportPath, "utf8")) as {
        deleted: number;
        eligible: number;
      };
      expect(payload.eligible).toBeGreaterThanOrEqual(1);
      expect(payload.deleted).toBeGreaterThanOrEqual(1);

      await expect(readFile(oldPath, "utf8")).rejects.toThrow();
      await readFile(newPath, "utf8");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("no-op when ttl-days is 0", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "prune-ev2-"));
    try {
      const p = path.join(dir, "soak-x.jsonl");
      const reportPath = path.join(dir, "prune-report.json");
      await writeFile(p, "z\n", "utf8");
      const result = await runCommandWithTimeout(
        ["node", "scripts/prune-evidence.mjs", "--evidence-dir", dir, "--ttl-days", "0", "--out", reportPath],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(0);
      const payload = JSON.parse(await readFile(reportPath, "utf8")) as { ttlDays: number };
      await readFile(p, "utf8");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
