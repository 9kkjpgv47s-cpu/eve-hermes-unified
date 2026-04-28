import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "h4-closeout-evidence-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("h4-closeout-evidence.mjs", () => {
  it("writes a passing h4-closeout-evidence manifest", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      await mkdir(evidenceDir, { recursive: true });
      const result = await runCommandWithTimeout(
        ["node", "scripts/h4-closeout-evidence.mjs", "--evidence-dir", evidenceDir],
        { timeoutMs: 120_000 },
      );
      expect(result.code).toBe(0);
      const outLine = result.stdout.trim().split("\n").filter(Boolean).at(-1) ?? "";
      expect(outLine).toContain("h4-closeout-evidence-");
      const raw = await readFile(outLine, "utf8");
      const payload = JSON.parse(raw) as { pass: boolean; checks: Record<string, boolean> };
      expect(payload.pass).toBe(true);
      expect(payload.checks.dispatchFixtureConformancePass).toBe(true);
      expect(payload.checks.memoryAuditReportPass).toBe(true);
    });
  });
});
