import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "validate-merge-bundle-selection-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("validate-merge-bundle.sh report selection", () => {
  it("selects newest release-readiness and initial-scope reports by default", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const oldReleasePath = path.join(evidenceDir, "release-readiness-20260101-000000.json");
      const newReleasePath = path.join(evidenceDir, "release-readiness-20260101-000001.json");
      const oldInitialPath = path.join(evidenceDir, "initial-scope-validation-20260101-000000.json");
      const newInitialPath = path.join(evidenceDir, "initial-scope-validation-20260101-000001.json");
      const validationSummaryPath = path.join(evidenceDir, "validation-summary-1.json");
      const regressionPath = path.join(evidenceDir, "regression-eve-primary-1.json");
      const cutoverPath = path.join(evidenceDir, "cutover-readiness-1.json");
      const failureInjectionPath = path.join(evidenceDir, "failure-injection-1.txt");
      const soakPath = path.join(evidenceDir, "soak-1.jsonl");
      const commandLogDir = path.join(evidenceDir, "release-command-logs");
      const commandsFilePath = path.join(evidenceDir, "commands.json");
      const checklistPath = path.join(dir, "MASTER_EXECUTION_CHECKLIST.md");
      const validationManifestPath = path.join(evidenceDir, "merge-bundle-validation.json");

      await mkdir(evidenceDir, { recursive: true });
      await mkdir(commandLogDir, { recursive: true });
      await writeFile(path.join(commandLogDir, "check.log"), "ok\n", "utf8");
      await writeFile(commandsFilePath, "[]\n", "utf8");
      await writeFile(checklistPath, "# Master Execution Checklist\n\n- [x] done\n", "utf8");
      await writeFile(validationSummaryPath, JSON.stringify({ gates: { passed: true } }), "utf8");
      await writeFile(regressionPath, JSON.stringify({ pass: true }), "utf8");
      await writeFile(cutoverPath, JSON.stringify({ pass: true }), "utf8");
      await writeFile(failureInjectionPath, "ok\n", "utf8");
      await writeFile(soakPath, "{}\n", "utf8");

      const baseRelease = {
        readinessVersion: "v1",
        generatedAtIso: new Date().toISOString(),
        defaultValidationCommand: "validate:all",
        pass: true,
        files: {
          validationSummary: validationSummaryPath,
          regression: regressionPath,
          cutoverReadiness: cutoverPath,
          failureInjection: failureInjectionPath,
          soak: soakPath,
          commandLogDir,
          commandsFile: commandsFilePath,
        },
        requiredArtifacts: [],
        releaseCommandLogs: [],
        checks: {
          validationSummaryPassed: true,
          regressionPassed: true,
          cutoverReadinessPassed: true,
          commandLogsMissing: [],
          discoveredCommandLogs: [],
          requiredReleaseCommands: [],
          missingRequiredCommands: [],
          executedReleaseCommands: [],
          missingCommandLogFiles: [],
          commandFailures: [],
          validationCommandsPassed: true,
        },
        failures: [],
      };

      await writeFile(
        oldReleasePath,
        JSON.stringify(
          {
            ...baseRelease,
            files: {
              ...baseRelease.files,
              validationSummary: path.join(evidenceDir, "missing-summary.json"),
            },
          },
          null,
          2,
        ),
        "utf8",
      );
      await writeFile(newReleasePath, JSON.stringify(baseRelease, null, 2), "utf8");

      await writeFile(oldInitialPath, JSON.stringify({ pass: false, failures: ["old"] }, null, 2), "utf8");
      await writeFile(
        newInitialPath,
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
            UNIFIED_MERGE_BUNDLE_VALIDATION_MANIFEST_PATH: validationManifestPath,
          },
        },
      );
      expect(result.code).toBe(0);

      const payload = JSON.parse(await readFile(validationManifestPath, "utf8")) as {
        pass: boolean;
        files: { releaseReadinessPath: string; initialScopePath: string };
      };
      expect(payload.pass).toBe(true);
      expect(payload.files.releaseReadinessPath).toBe(newReleasePath);
      expect(payload.files.initialScopePath).toBe(newInitialPath);
    });
  });
});
