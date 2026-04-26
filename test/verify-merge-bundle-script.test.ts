import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "verify-merge-bundle-script-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function seedBundleFixture(rootDir: string): Promise<{
  evidenceDir: string;
  releaseReadinessPath: string;
  initialScopePath: string;
  bundleDir: string;
  archivePath: string;
  bundleManifestPath: string;
}> {
  const evidenceDir = path.join(rootDir, "evidence");
  const releaseReadinessPath = path.join(evidenceDir, "release-readiness-1.json");
  const initialScopePath = path.join(evidenceDir, "initial-scope-validation-1.json");
  const validationSummaryPath = path.join(evidenceDir, "validation-summary-1.json");
  const regressionPath = path.join(evidenceDir, "regression-eve-primary-1.json");
  const cutoverPath = path.join(evidenceDir, "cutover-readiness-1.json");
  const failureInjectionPath = path.join(evidenceDir, "failure-injection-1.txt");
  const soakPath = path.join(evidenceDir, "soak-1.jsonl");
  const commandsFilePath = path.join(evidenceDir, "commands.json");
  const commandLogDir = path.join(evidenceDir, "release-command-logs");
  const checklistPath = path.join(rootDir, "MASTER_EXECUTION_CHECKLIST.md");
  const bundleDir = path.join(evidenceDir, "merge-readiness-bundle-1");
  const archivePath = path.join(evidenceDir, "merge-readiness-bundle-1.tar.gz");
  const bundleManifestPath = path.join(bundleDir, "merge-readiness-manifest.json");

  await mkdir(evidenceDir, { recursive: true });
  await mkdir(commandLogDir, { recursive: true });
  await writeFile(checklistPath, "# Master Execution Checklist\n\n- [x] done\n", "utf8");
  await writeFile(validationSummaryPath, JSON.stringify({ gates: { passed: true } }), "utf8");
  await writeFile(regressionPath, JSON.stringify({ pass: true }), "utf8");
  await writeFile(cutoverPath, JSON.stringify({ pass: true }), "utf8");
  await writeFile(failureInjectionPath, "failure report\n", "utf8");
  await writeFile(soakPath, "{}\n", "utf8");
  await writeFile(path.join(commandLogDir, "check.log"), "ok\n", "utf8");
  await writeFile(
    commandsFilePath,
    JSON.stringify(
      [{ name: "check", command: "check", logFile: "check.log", status: "passed", exitCode: 0 }],
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(
    releaseReadinessPath,
    JSON.stringify(
      {
        readinessVersion: "v1",
        generatedAtIso: new Date().toISOString(),
        defaultValidationCommand: "validate:all",
        pass: true,
        failures: [],
        files: {
          validationSummary: validationSummaryPath,
          regression: regressionPath,
          cutoverReadiness: cutoverPath,
          failureInjection: failureInjectionPath,
          soak: soakPath,
          commandsFile: commandsFilePath,
          commandLogDir,
        },
        requiredArtifacts: [
          { name: "validation-summary", path: validationSummaryPath, present: true },
          { name: "regression-eve-primary", path: regressionPath, present: true },
          { name: "cutover-readiness", path: cutoverPath, present: true },
          { name: "failure-injection", path: failureInjectionPath, present: true },
          { name: "soak", path: soakPath, present: true },
        ],
        releaseCommandLogs: [
          { name: "check", command: "check", logFile: "check.log", status: "passed", exitCode: 0 },
        ],
        checks: {
          validationSummaryPassed: true,
          regressionPassed: true,
          cutoverReadinessPassed: true,
          commandLogsMissing: [],
          discoveredCommandLogs: ["check.log"],
          requiredReleaseCommands: ["check"],
          missingRequiredCommands: [],
          executedReleaseCommands: ["check"],
          missingCommandLogFiles: [],
          commandFailures: [],
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
        generatedAtIso: new Date().toISOString(),
        checklistPath,
        failures: [],
      },
      null,
      2,
    ),
    "utf8",
  );

  const buildResult = await runCommandWithTimeout(
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
      bundleManifestPath,
    ],
    { timeoutMs: 20_000 },
  );
  expect(buildResult.code).toBe(0);

  return {
    evidenceDir,
    releaseReadinessPath,
    initialScopePath,
    bundleDir,
    archivePath,
    bundleManifestPath,
  };
}

describe("verify-merge-bundle.mjs", () => {
  it("passes for a valid generated bundle", async () => {
    await withTempDir(async (dir) => {
      const fixture = await seedBundleFixture(dir);
      const outputPath = path.join(fixture.evidenceDir, "merge-bundle-verify.json");
      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/verify-merge-bundle.mjs",
          "--bundle-manifest",
          fixture.bundleManifestPath,
          "--out",
          outputPath,
        ],
        { timeoutMs: 20_000 },
      );
      expect(result.code).toBe(0);

      const payload = JSON.parse(await readFile(outputPath, "utf8")) as {
        pass: boolean;
        failures: string[];
      };
      expect(payload.pass).toBe(true);
      expect(payload.failures).toEqual([]);
    });
  });

  it("fails when archive is missing", async () => {
    await withTempDir(async (dir) => {
      const fixture = await seedBundleFixture(dir);
      await rm(fixture.archivePath, { force: true });

      const outputPath = path.join(fixture.evidenceDir, "merge-bundle-verify.json");
      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/verify-merge-bundle.mjs",
          "--bundle-manifest",
          fixture.bundleManifestPath,
          "--out",
          outputPath,
        ],
        { timeoutMs: 20_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outputPath, "utf8")) as {
        pass: boolean;
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.failures.some((item) => item === "missing_bundle_archive")).toBe(true);
    });
  });
});
