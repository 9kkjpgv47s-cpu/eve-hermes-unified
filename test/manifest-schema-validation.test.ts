import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "manifest-schema-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("validate-manifest-schema.mjs", () => {
  it("passes for a valid release-readiness manifest", async () => {
    await withTempDir(async (dir) => {
      const manifestPath = path.join(dir, "release-readiness.json");
      await writeFile(
        manifestPath,
        JSON.stringify(
          {
            readinessVersion: "v1",
            generatedAtIso: new Date().toISOString(),
            defaultValidationCommand: "validate:all",
            pass: true,
            files: {
              validationSummary: path.join(dir, "validation-summary.json"),
              regression: path.join(dir, "regression.json"),
              cutoverReadiness: path.join(dir, "cutover.json"),
              failureInjection: path.join(dir, "failure.txt"),
              soak: path.join(dir, "soak.jsonl"),
              commandLogDir: path.join(dir, "logs"),
              commandsFile: path.join(dir, "commands.json"),
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
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        ["node", "scripts/validate-manifest-schema.mjs", "--type", "release-readiness", "--file", manifestPath],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(0);
    });
  });

  it("fails for invalid merge-bundle manifest", async () => {
    await withTempDir(async (dir) => {
      const manifestPath = path.join(dir, "merge-bundle.json");
      await writeFile(
        manifestPath,
        JSON.stringify(
          {
            bundleVersion: "v1",
            pass: true,
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        ["node", "scripts/validate-manifest-schema.mjs", "--type", "merge-bundle", "--file", manifestPath],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(2);
      expect(result.stderr).toContain("Manifest schema validation failed");
    });
  });

  it("validates all manifests under evidence directory", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      await mkdir(evidenceDir, { recursive: true });
      const releasePath = path.join(evidenceDir, "release-readiness-1.json");
      const mergeBundlePath = path.join(evidenceDir, "merge-bundle-validation-1.json");

      await writeFile(
        releasePath,
        JSON.stringify(
          {
            readinessVersion: "v1",
            generatedAtIso: new Date().toISOString(),
            defaultValidationCommand: "validate:all",
            pass: true,
            files: {
              validationSummary: null,
              regression: null,
              cutoverReadiness: null,
              failureInjection: null,
              soak: null,
              commandLogDir: null,
              commandsFile: null,
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
          },
          null,
          2,
        ),
        "utf8",
      );
      await writeFile(
        mergeBundlePath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            files: {
              validationManifestPath: mergeBundlePath,
              bundleManifestPath: path.join(evidenceDir, "bundle", "merge-readiness-manifest.json"),
              releaseReadinessPath: releasePath,
              initialScopePath: path.join(evidenceDir, "initial-scope-validation-1.json"),
              bundleArchivePath: path.join(evidenceDir, "bundle.tar.gz"),
            },
            checks: {
              buildExitCode: 0,
              bundleManifestPresent: true,
              bundleManifestPass: true,
              bundleFailures: [],
            },
            failures: [],
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        ["node", "scripts/validate-manifest-schema.mjs", "--type", "all", "--evidence-dir", evidenceDir],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(0);

      const output = result.stdout.trim();
      expect(output.startsWith("{")).toBe(true);
      const payload = JSON.parse(output) as { pass: boolean; validatedCount: number };
      expect(payload.pass).toBe(true);
      expect(payload.validatedCount).toBe(2);
    });
  });
});
