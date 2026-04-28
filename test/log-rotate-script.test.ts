import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "log-rotate-script-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("log-rotate.mjs", () => {
  it("rotates a single file when over max bytes", async () => {
    await withTempDir(async (dir) => {
      const logPath = path.join(dir, "step.log");
      await writeFile(logPath, "a".repeat(80), "utf8");
      const result = await runCommandWithTimeout(
        ["node", "scripts/log-rotate.mjs", "--file", logPath],
        {
          timeoutMs: 5_000,
          env: { ...process.env, UNIFIED_LOG_ROTATE_MAX_BYTES: "40", UNIFIED_LOG_ROTATE_MAX_FILES: "4" },
        },
      );
      expect(result.code).toBe(0);
      expect((await stat(logPath)).size).toBe(0);
      expect((await readFile(`${logPath}.1`, "utf8")).length).toBe(80);
    });
  });

  it("rotates matching files in a directory", async () => {
    await withTempDir(async (dir) => {
      await writeFile(path.join(dir, "a.log"), "b".repeat(60), "utf8");
      await writeFile(path.join(dir, "b.log"), "c".repeat(60), "utf8");
      await writeFile(path.join(dir, "skip.txt"), "x", "utf8");
      const result = await runCommandWithTimeout(
        ["node", "scripts/log-rotate.mjs", "--dir", dir, "--glob", "*.log"],
        {
          timeoutMs: 5_000,
          env: { ...process.env, UNIFIED_LOG_ROTATE_MAX_BYTES: "30", UNIFIED_LOG_ROTATE_MAX_FILES: "3" },
        },
      );
      expect(result.code).toBe(0);
      expect((await stat(path.join(dir, "a.log"))).size).toBe(0);
      expect((await stat(path.join(dir, "b.log"))).size).toBe(0);
      expect((await readFile(path.join(dir, "a.log.1"), "utf8")).length).toBe(60);
      expect((await stat(path.join(dir, "skip.txt"))).size).toBe(1);
    });
  });
});
