import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "validate-merge-bundle-script-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("validate-merge-bundle.sh", () => {
  it("packages existing passing evidence without rerunning validations", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const releaseReadinessPath = path.join(evidenceDir, "release-readiness-1.json");
      const initialScopePath = path.join(evidenceDir, "initial-scope-validation-1.json");
      const validationSummaryPath = path.join(evidenceDir, "validation-summary-1.json");
      const regressionPath = path.join(evidenceDir, "regression-eve-primary-1.json");
      const cutoverPath = path.join(evidenceDir, "cutover-readiness-1.json");
      const failureInjectionPath = path.join(evidenceDir, "failure-injection-1.txt");
      const soakPath = path.join(evidenceDir, "soak-1.jsonl");
      const commandsFilePath = path.join(evidenceDir, "commands.json");
      const commandLogDir = path.join(evidenceDir, "release-command-logs");
      const checklistPath = path.join(dir, "MASTER_EXECUTION_CHECKLIST.md");
      const bundleDir = path.join(evidenceDir, "bundle-output");
      const archivePath = path.join(evidenceDir, "bundle-output.tar.gz");
      const validationManifestPath = path.join(evidenceDir, "merge-bundle-validation.json");

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
            checks: {
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
            failures: [],
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        ["bash", "scripts/validate-merge-bundle.sh"],
        {
          timeoutMs: 20_000,
          env: {
            ...process.env,
            UNIFIED_EVIDENCE_DIR: evidenceDir,
            UNIFIED_MERGE_BUNDLE_RUN_RELEASE_READINESS: "0",
            UNIFIED_MERGE_BUNDLE_RUN_INITIAL_SCOPE: "0",
            UNIFIED_RELEASE_READINESS_PATH: releaseReadinessPath,
            UNIFIED_INITIAL_SCOPE_REPORT_PATH: initialScopePath,
            UNIFIED_MERGE_BUNDLE_DIR: bundleDir,
            UNIFIED_MERGE_BUNDLE_ARCHIVE_PATH: archivePath,
            UNIFIED_MERGE_BUNDLE_VALIDATION_MANIFEST_PATH: validationManifestPath,
          },
        },
      );
      expect(result.code).toBe(0);

      const validationManifest = JSON.parse(await readFile(validationManifestPath, "utf8")) as {
        pass: boolean;
        checks?: { bundleManifestPass?: boolean };
      };
      expect(validationManifest.pass).toBe(true);
      expect(validationManifest.checks?.bundleManifestPass).toBe(true);
    });
  });

  it("fails when required reports are missing", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const validationManifestPath = path.join(evidenceDir, "merge-bundle-validation.json");
      await mkdir(evidenceDir, { recursive: true });

      const result = await runCommandWithTimeout(
        ["bash", "scripts/validate-merge-bundle.sh"],
        {
          timeoutMs: 20_000,
          env: {
            ...process.env,
            UNIFIED_EVIDENCE_DIR: evidenceDir,
            UNIFIED_MERGE_BUNDLE_RUN_RELEASE_READINESS: "0",
            UNIFIED_MERGE_BUNDLE_RUN_INITIAL_SCOPE: "0",
            UNIFIED_MERGE_BUNDLE_VALIDATION_MANIFEST_PATH: validationManifestPath,
          },
        },
      );
      expect(result.code).not.toBe(0);

      const validationManifest = JSON.parse(await readFile(validationManifestPath, "utf8")) as {
        pass: boolean;
        checks: { buildExitCode: number };
        failures: string[];
      };
      expect(validationManifest.pass).toBe(false);
      expect(validationManifest.checks.buildExitCode).not.toBe(0);
      expect(validationManifest.failures.some((item) => item === "missing_release_readiness_report")).toBe(
        true,
      );
    });
  });
});
