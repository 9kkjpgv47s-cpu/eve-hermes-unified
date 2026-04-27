import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "merge-readiness-bundle-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("build-merge-readiness-bundle.mjs", () => {
  it("creates bundle manifest and archive when readiness reports pass", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const releaseReadinessPath = path.join(evidenceDir, "release-readiness-1.json");
      const initialScopePath = path.join(evidenceDir, "initial-scope-validation-1.json");
      const validationSummaryPath = path.join(evidenceDir, "validation-summary-1.json");
      const regressionPath = path.join(evidenceDir, "regression-eve-primary-1.json");
      const cutoverPath = path.join(evidenceDir, "cutover-readiness-1.json");
      const failureInjectionPath = path.join(evidenceDir, "failure-injection-1.txt");
      const soakPath = path.join(evidenceDir, "soak-1.jsonl");
      const goalPolicyValidationPath = path.join(evidenceDir, "goal-policy-file-validation-1.json");
      const commandsFilePath = path.join(evidenceDir, "command-results.json");
      const commandLogDir = path.join(evidenceDir, "command-logs");
      const checklistPath = path.join(dir, "MASTER_EXECUTION_CHECKLIST.md");
      const bundleDir = path.join(evidenceDir, "merge-bundle");
      const archivePath = path.join(evidenceDir, "merge-bundle.tar.gz");
      const manifestPath = path.join(evidenceDir, "merge-bundle-manifest.json");

      await mkdir(evidenceDir, { recursive: true });
      await mkdir(commandLogDir, { recursive: true });
      await writeFile(checklistPath, "# Master Execution Checklist\n\n- [x] done\n", "utf8");
      await writeFile(validationSummaryPath, JSON.stringify({ gates: { passed: true } }), "utf8");
      await writeFile(regressionPath, JSON.stringify({ pass: true }), "utf8");
      await writeFile(cutoverPath, JSON.stringify({ pass: true }), "utf8");
      await writeFile(failureInjectionPath, "failure report\n", "utf8");
      await writeFile(soakPath, "{}\n", "utf8");
      await writeFile(goalPolicyValidationPath, JSON.stringify({ pass: true }), "utf8");
      await writeFile(
        commandsFilePath,
        JSON.stringify(
          [{ name: "check", command: "check", logFile: "check.log", status: "passed", exitCode: 0 }],
          null,
          2,
        ),
        "utf8",
      );
      await writeFile(path.join(commandLogDir, "check.log"), "ok\n", "utf8");
      await writeFile(
        releaseReadinessPath,
        JSON.stringify(
          {
            pass: true,
            failures: [],
            files: {
              validationSummary: validationSummaryPath,
              regression: regressionPath,
              cutoverReadiness: cutoverPath,
              failureInjection: failureInjectionPath,
              soak: soakPath,
              goalPolicyFileValidation: goalPolicyValidationPath,
              commandsFile: commandsFilePath,
              commandLogDir,
            },
            checks: {
              goalPolicyFileValidationPassed: true,
              validationCommandsPassed: true,
            },
          },
          null,
          2,
        ),
        "utf8",
      );
      await writeFile(
        initialScopePath,
        JSON.stringify(
          {
            pass: true,
            checklistPath,
            checks: {
              releaseReadinessGoalPolicyValidationPassed: true,
            },
            failures: [],
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/build-merge-readiness-bundle.mjs",
          "--evidence-dir",
          evidenceDir,
          "--release-readiness",
          releaseReadinessPath,
          "--initial-scope",
          initialScopePath,
          "--bundle-dir",
          bundleDir,
          "--archive-path",
          archivePath,
          "--manifest-out",
          manifestPath,
        ],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(0);

      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
        pass: boolean;
        archivePath: string;
        failures: string[];
      };
      expect(manifest.pass).toBe(true);
      expect(manifest.archivePath).toBe(archivePath);
      expect(manifest.failures).toEqual([]);
    });
  });

  it("fails when required release readiness artifacts are missing", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const releaseReadinessPath = path.join(evidenceDir, "release-readiness-1.json");
      const initialScopePath = path.join(evidenceDir, "initial-scope-validation-1.json");
      const manifestPath = path.join(evidenceDir, "merge-bundle-manifest.json");

      await mkdir(evidenceDir, { recursive: true });
      await writeFile(
        releaseReadinessPath,
        JSON.stringify(
          {
            pass: true,
            failures: [],
            files: {
              validationSummary: path.join(evidenceDir, "missing-validation-summary.json"),
            },
          },
          null,
          2,
        ),
        "utf8",
      );
      await writeFile(
        initialScopePath,
        JSON.stringify(
          {
            pass: true,
            failures: [],
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/build-merge-readiness-bundle.mjs",
          "--evidence-dir",
          evidenceDir,
          "--release-readiness",
          releaseReadinessPath,
          "--initial-scope",
          initialScopePath,
          "--manifest-out",
          manifestPath,
        ],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(2);

      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
        pass: boolean;
        failures: string[];
      };
      expect(manifest.pass).toBe(false);
      expect(manifest.failures.some((item) => item.startsWith("missing_required_inputs:"))).toBe(true);
    });
  });
});
