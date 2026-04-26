import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "release-readiness-script-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("validate-release-readiness.sh", () => {
  it("writes a passing release readiness manifest", { timeout: 60_000 }, async () => {
    await withTempDir(async (dir) => {
      const reportPath = path.join(dir, "release-readiness.json");
      const commandLogDir = path.join(dir, "release-command-logs");
      const result = await runCommandWithTimeout(
        ["bash", "scripts/validate-release-readiness.sh"],
        {
          timeoutMs: 180_000,
          env: {
            ...process.env,
            UNIFIED_EVIDENCE_DIR: dir,
            UNIFIED_RELEASE_READINESS_REPORT_PATH: reportPath,
            UNIFIED_RELEASE_READINESS_RUN_VALIDATE_ALL: "0",
            UNIFIED_RELEASE_READINESS_SKIP_TEST: "1",
            UNIFIED_RELEASE_READINESS_COMMAND_LOG_DIR: commandLogDir,
            UNIFIED_ROUTER_DEFAULT_PRIMARY: "hermes",
            UNIFIED_ROUTER_DEFAULT_FALLBACK: "none",
            UNIFIED_ROUTER_FAIL_CLOSED: "1",
            UNIFIED_ROUTER_CUTOVER_STAGE: "full",
            UNIFIED_MEMORY_STORE_KIND: "file",
            UNIFIED_MEMORY_FILE_PATH: path.join(dir, "memory.json"),
            EVE_TASK_DISPATCH_SCRIPT: "/bin/true",
            EVE_DISPATCH_RESULT_PATH: path.join(dir, "eve-state.json"),
            HERMES_LAUNCH_COMMAND: "/bin/true",
            HERMES_LAUNCH_ARGS: "",
            UNIFIED_EVIDENCE_MIN_SUCCESS_RATE: "0.95",
            UNIFIED_EVIDENCE_MAX_P95_LATENCY_MS: "2500",
            UNIFIED_EVIDENCE_REQUIRE_FAILURE_SCENARIOS: "1",
          },
        },
      );
      expect(result.code).toBe(0);
      const reportRaw = await readFile(reportPath, "utf8");
      expect(reportRaw).toContain("\"pass\": true");
      expect(reportRaw).toContain("\"readinessVersion\": \"v1\"");
      expect(reportRaw).toContain("\"validate:all\"");
      expect(reportRaw).toContain("\"releaseCommandLogs\"");
      expect(reportRaw).toContain("\"requiredArtifacts\"");
      expect(reportRaw).toContain("\"commandsFile\"");
      expect(reportRaw).toContain("\"validationCommandsPassed\": true");
      expect(reportRaw).toContain("\"validate:failure-injection\"");
      expect(reportRaw).toContain("\"validate:cutover-readiness\"");
    });
  });
});
