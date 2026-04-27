import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "release-readiness-manifest-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("release-readiness.mjs", () => {
  it("fails when required command logs are missing", async () => {
    await withTempDir(async (dir) => {
      const summaryPath = path.join(dir, "validation-summary-1.json");
      const regressionPath = path.join(dir, "regression-eve-primary-1.json");
      const cutoverPath = path.join(dir, "cutover-readiness-1.json");
      const failurePath = path.join(dir, "failure-injection-1.txt");
      const soakPath = path.join(dir, "soak-1.jsonl");
      const commandFile = path.join(dir, "release-command-results.json");
      const outPath = path.join(dir, "release-readiness.json");
      const goalPolicyValidationPath = path.join(dir, "goal-policy-file-validation-1.json");

      await writeFile(
        summaryPath,
        JSON.stringify({ gates: { passed: true, failures: [] } }, null, 2),
        "utf8",
      );
      await writeFile(regressionPath, JSON.stringify({ pass: true }, null, 2), "utf8");
      await writeFile(cutoverPath, JSON.stringify({ pass: true }, null, 2), "utf8");
      await writeFile(failurePath, "failure report\n", "utf8");
      await writeFile(soakPath, "{}\n", "utf8");
      await writeFile(
        goalPolicyValidationPath,
        JSON.stringify({ pass: true, failures: [] }, null, 2),
        "utf8",
      );
      await writeFile(
        commandFile,
        JSON.stringify(
          [{ command: "npm run check", logFile: "missing.log", exitCode: 0, status: "passed" }],
          null,
          2,
        ),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/release-readiness.mjs",
          "--evidence-dir",
          dir,
          "--out",
          outPath,
          "--commands-file",
          commandFile,
          "--command-log-dir",
          dir,
        ],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.failures.some((item) => item.startsWith("missing_command_logs:"))).toBe(true);
    });
  });

  it("fails when goal-policy validation report is required but missing", async () => {
    await withTempDir(async (dir) => {
      const summaryPath = path.join(dir, "validation-summary-1.json");
      const regressionPath = path.join(dir, "regression-eve-primary-1.json");
      const cutoverPath = path.join(dir, "cutover-readiness-1.json");
      const failurePath = path.join(dir, "failure-injection-1.txt");
      const soakPath = path.join(dir, "soak-1.jsonl");
      const commandFile = path.join(dir, "release-command-results.json");
      const commandLogDir = path.join(dir, "release-command-logs");
      const outPath = path.join(dir, "release-readiness.json");
      await writeFile(
        summaryPath,
        JSON.stringify({ gates: { passed: true, failures: [] } }, null, 2),
        "utf8",
      );
      await writeFile(regressionPath, JSON.stringify({ pass: true }, null, 2), "utf8");
      await writeFile(cutoverPath, JSON.stringify({ pass: true }, null, 2), "utf8");
      await writeFile(failurePath, "failure report\n", "utf8");
      await writeFile(soakPath, "{}\n", "utf8");
      await writeFile(
        commandFile,
        JSON.stringify([{ name: "check", command: "check", logFile: "check.log", exitCode: 0, status: "passed" }], null, 2),
        "utf8",
      );
      await writeFile(path.join(dir, "check.log"), "ok\n", "utf8");
      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/release-readiness.mjs",
          "--evidence-dir",
          dir,
          "--out",
          outPath,
          "--commands-file",
          commandFile,
          "--command-log-dir",
          dir,
          "--required-command-names",
          "check",
          "--require-goal-policy-file-validation-report",
        ],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(2);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.failures).toContain("missing_goal_policy_file_validation_report");
      await rm(commandLogDir, { recursive: true, force: true });
    });
  });
});
