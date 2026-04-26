import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "regression-eve-primary-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("regression-eve-primary.sh", () => {
  it("writes a passing regression summary with eve-safe settings", async () => {
    await withTempDir(async (dir) => {
      const summaryPath = path.join(dir, "eve-regression-summary.json");
      const result = await runCommandWithTimeout(
        [
          "bash",
          "scripts/regression-eve-primary.sh",
          "--summary-out",
          summaryPath,
          "--iterations",
          "4",
        ],
        {
          timeoutMs: 30_000,
          env: {
            ...process.env,
            HERMES_LAUNCH_COMMAND: "/bin/true",
            HERMES_LAUNCH_ARGS: "",
            EVE_TASK_DISPATCH_SCRIPT: "/bin/true",
            EVE_DISPATCH_RESULT_PATH: "/tmp/eve-regression-state.json",
          },
        },
      );
      expect(result.code).toBe(0);
      const summaryRaw = await readFile(summaryPath, "utf8");
      expect(summaryRaw).toContain("\"pass\": true");
      expect(summaryRaw).toContain("\"requiredPrimaryLane\": \"eve\"");
      expect(summaryRaw).toContain("\"requiredFallbackLane\": \"none\"");
    });
  });
});
