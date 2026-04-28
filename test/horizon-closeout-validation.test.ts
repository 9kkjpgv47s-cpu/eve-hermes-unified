import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "horizon-closeout-validation-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function seedEvidence(evidenceDir: string): Promise<{
  summaryPath: string;
  releasePath: string;
  initialScopePath: string;
  mergeValidationPath: string;
  verifyPath: string;
  cutoverPath: string;
  stagePromotionPath: string;
}> {
  const stamp = "20260426-000000";
  await rm(evidenceDir, { recursive: true, force: true });
  await runCommandWithTimeout(
    ["node", "-e", `require("fs").mkdirSync(${JSON.stringify(evidenceDir)}, { recursive: true })`],
    { timeoutMs: 10_000 },
  );

  const summaryPath = path.join(evidenceDir, `validation-summary-${stamp}.json`);
  const releasePath = path.join(evidenceDir, `release-readiness-${stamp}.json`);
  const initialScopePath = path.join(evidenceDir, `initial-scope-validation-${stamp}.json`);
  const mergeValidationPath = path.join(evidenceDir, `merge-bundle-validation-${stamp}.json`);
  const verifyPath = path.join(evidenceDir, `bundle-verification-${stamp}.json`);
  const cutoverPath = path.join(evidenceDir, `cutover-readiness-${stamp}.json`);
  const stagePromotionPath = path.join(evidenceDir, `stage-promotion-readiness-${stamp}.json`);

  await writeFile(
    summaryPath,
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        metrics: {
          successRate: 1,
          missingTraceRate: 0,
          unclassifiedFailures: 0,
          failureScenarioPassCount: 5,
        },
        gates: {
          passed: true,
          failures: [],
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  await writeFile(
    releasePath,
    JSON.stringify(
      {
        readinessVersion: "v1",
        generatedAtIso: new Date().toISOString(),
        defaultValidationCommand: "validate:all",
        pass: true,
        files: {
          validationSummary: summaryPath,
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
          releaseGoalPolicyValidationPassed: true,
          goalPolicyFileValidationPassed: true,
          requiredReleaseCommands: [],
          missingRequiredCommands: [],
          executedReleaseCommands: [],
          missingCommandLogFiles: [],
          commandFailures: [],
          commandLogsMissing: [],
          discoveredCommandLogs: [],
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
    initialScopePath,
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        pass: true,
        checklistPath: "/tmp/MASTER_EXECUTION_CHECKLIST.md",
        releaseReadinessPath: releasePath,
        missingChecklistItems: [],
        releaseReadinessPass: true,
            releaseReadinessGoalPolicyValidationPass: true,
        checks: {
          uncheckedChecklistItems: [],
          releaseReadinessPassed: true,
              releaseReadinessGoalPolicyValidationPassed: true,
          releaseReadinessFailures: [],
        },
        failures: [],
      },
      null,
      2,
    ),
    "utf8",
  );

  await writeFile(
    mergeValidationPath,
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        pass: true,
        files: {
          validationManifestPath: mergeValidationPath,
          bundleManifestPath: "/tmp/merge-readiness-manifest.json",
          releaseReadinessPath: releasePath,
          initialScopePath,
          bundleArchivePath: "/tmp/merge-readiness-bundle.tar.gz",
        },
        checks: {
          buildExitCode: 0,
          bundleManifestPresent: true,
          bundleManifestPass: true,
              releaseGoalPolicyValidationReported: true,
              releaseGoalPolicyValidationPassed: true,
              initialScopeGoalPolicyValidationReported: true,
              initialScopeGoalPolicyValidationPassed: true,
          bundleFailures: [],
        },
        failures: [],
      },
      null,
      2,
    ),
    "utf8",
  );

  await writeFile(
    verifyPath,
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        pass: true,
        files: {
          evidenceDir,
          bundleDir: "/tmp/merge-readiness-bundle",
          bundleManifestPath: "/tmp/merge-readiness-manifest.json",
          bundleArchivePath: "/tmp/merge-readiness-bundle.tar.gz",
          validationManifestPath: mergeValidationPath,
          outPath: verifyPath,
        },
        checks: {
          manifestSchemaValid: true,
          bundleManifestPass: true,
          latestRequested: false,
          latestAliasResolved: false,
          latestAliasFallbackUsed: false,
          validationManifestResolved: true,
          validationManifestResolvedReported: true,
          releaseReadinessSchemaValid: true,
          releaseReadinessPass: true,
          releaseGoalPolicyValidationReported: true,
          releaseGoalPolicyValidationPassed: true,
          initialScopePass: true,
          initialScopeGoalPolicyValidationReported: true,
          initialScopeGoalPolicyValidationPassed: true,
          requiredBundleFilesMissing: [],
          copiedArtifactsMissing: [],
          archiveChecked: true,
          archiveMissingEntries: [],
        },
        failures: [],
      },
      null,
      2,
    ),
    "utf8",
  );

  await writeFile(
    cutoverPath,
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        pass: true,
      },
      null,
      2,
    ),
    "utf8",
  );

  await writeFile(
    stagePromotionPath,
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        pass: true,
        stage: {
          current: "shadow",
          target: "canary",
          transitionAllowed: true,
        },
        checks: {
          validationSummaryPassed: true,
          cutoverReadinessPassed: true,
          goalPolicyFileValidationPassed: true,
          releaseReadinessPassed: true,
          mergeBundleValidationPassed: true,
          bundleVerificationPassed: true,
          horizonValidationPass: true,
          activeHorizon: "H1",
          activeStatus: "in_progress",
          stage: "canary",
        },
        failures: [],
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    summaryPath,
    cutoverPath,
    releasePath,
    initialScopePath,
    mergeValidationPath,
    verifyPath,
    stagePromotionPath,
  };
}

async function seedHorizonStatus(statusPath: string, mode: "h1-in-progress" | "h1-completed"): Promise<void> {
  const isCompleted = mode === "h1-completed";
  await writeFile(
    statusPath,
    JSON.stringify(
      {
        schemaVersion: "v1",
        updatedAtIso: new Date().toISOString(),
        owner: "cloud-agent",
        activeHorizon: isCompleted ? "H2" : "H1",
        activeStatus: "in_progress",
        summary: "closeout test fixture",
        blockers: [],
        requiredEvidence: [
          {
            id: "h1-validate-all",
            command: "npm run validate:all",
            artifactPattern: "evidence/validation-summary-*.json",
            required: true,
          },
          {
            id: "h1-release-readiness",
            command: "npm run validate:release-readiness",
            artifactPattern: "evidence/release-readiness-*.json",
            required: true,
          },
          {
            id: "h1-initial-scope",
            command: "npm run validate:initial-scope",
            artifactPattern: "evidence/initial-scope-validation-*.json",
            required: true,
          },
          {
            id: "h1-merge-bundle",
            command: "npm run validate:merge-bundle",
            artifactPattern: "evidence/merge-bundle-validation-*.json",
            required: true,
          },
          {
            id: "h1-bundle-verification",
            command: "npm run verify:merge-bundle",
            artifactPattern: "evidence/bundle-verification-*.json",
            required: true,
          },
          {
            id: "h1-evidence-summary",
            command: "npm run validate:evidence-summary",
            artifactPattern: "evidence/validation-summary-*.json",
            required: true,
          },
          {
            id: "h1-cutover-readiness",
            command: "npm run validate:cutover-readiness",
            artifactPattern: "evidence/cutover-readiness-*.json",
            required: true,
          },
        ],
        nextActions: [
          {
            id: "h1-action-1",
            summary: "closeout fixture action",
            targetHorizon: isCompleted ? "H2" : "H1",
            status: isCompleted ? "completed" : "in_progress",
          },
        ],
        promotionReadiness: {
          targetStage: "canary",
          gates: {
            releaseReadinessPass: true,
            mergeBundlePass: true,
            bundleVerificationPass: true,
            cutoverReadinessPass: true,
            evidenceSummaryPass: true,
          },
        },
        horizonStates: {
          H1: {
            status: isCompleted ? "completed" : "in_progress",
            summary: isCompleted ? "H1 complete" : "H1 active",
          },
          H2: {
            status: "in_progress",
            summary: "H2 active",
          },
          H3: { status: "planned", summary: "H3" },
          H4: { status: "planned", summary: "H4" },
          H5: { status: "planned", summary: "H5" },
        },
        history: [
          {
            timestamp: new Date().toISOString(),
            horizon: "H1",
            status: isCompleted ? "completed" : "in_progress",
            note: "seed fixture",
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
}

describe("validate-horizon-closeout.mjs", () => {
  it("passes when H1 closeout evidence is complete", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outputPath = path.join(evidenceDir, "horizon-closeout.json");
      await seedEvidence(evidenceDir);
      await seedHorizonStatus(horizonPath, "h1-in-progress");

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-horizon-closeout.mjs",
          "--horizon",
          "H1",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--out",
          outputPath,
        ],
        { timeoutMs: 20_000 },
      );
      if (result.code !== 0) {
        throw new Error(`expected pass but got code=${String(result.code)} stderr=${result.stderr}`);
      }
      expect(result.code).toBe(0);

      const payload = JSON.parse(await readFile(outputPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: {
          releaseReadinessPassed: boolean;
          stagePromotionPassed: boolean;
          horizonStatusValid: boolean;
        };
      };
      expect(payload.pass).toBe(true);
      expect(payload.failures).toEqual([]);
      expect(payload.checks.releaseReadinessPassed).toBe(true);
      expect(payload.checks.stagePromotionPassed).toBe(true);
      expect(payload.checks.horizonStatusValid).toBe(true);
    });
  });

  it("fails when required evidence is missing", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outputPath = path.join(evidenceDir, "horizon-closeout.json");
      const seeded = await seedEvidence(evidenceDir);
      await rm(seeded.verifyPath, { force: true });
      await seedHorizonStatus(horizonPath, "h1-in-progress");

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-horizon-closeout.mjs",
          "--horizon",
          "H1",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
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
      expect(payload.failures.some((item) => item.startsWith("missing_required_evidence:"))).toBe(true);
    });
  });

  it("fails when initial-scope goal-policy validation is not passed", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outputPath = path.join(evidenceDir, "horizon-closeout.json");
      const seeded = await seedEvidence(evidenceDir);
      await seedHorizonStatus(horizonPath, "h1-in-progress");

      const initialScopePayload = JSON.parse(await readFile(seeded.initialScopePath, "utf8")) as {
        releaseReadinessGoalPolicyValidationPass?: boolean;
        checks?: Record<string, unknown>;
      };
      initialScopePayload.releaseReadinessGoalPolicyValidationPass = false;
      initialScopePayload.checks = {
        ...(initialScopePayload.checks ?? {}),
        releaseReadinessGoalPolicyValidationPassed: false,
      };
      await writeFile(
        seeded.initialScopePath,
        `${JSON.stringify(initialScopePayload, null, 2)}\n`,
        "utf8",
      );

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-horizon-closeout.mjs",
          "--horizon",
          "H1",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--out",
          outputPath,
        ],
        { timeoutMs: 20_000 },
      );
      expect(result.code).toBe(2);
      const payload = JSON.parse(await readFile(outputPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: { requiredEvidence: Array<{ id: string; pass: boolean; checks: string[] }> };
      };
      expect(payload.pass).toBe(false);
      expect(payload.failures).toContain("required_evidence_failed:h1-initial-scope");
      expect(payload.checks.requiredEvidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "h1-initial-scope",
            pass: false,
            checks: expect.arrayContaining(["initial_scope_goal_policy_validation_not_passed"]),
          }),
        ]),
      );
    });
  });

  it("fails when merge-bundle validation evidence omits goal-policy propagation checks", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outputPath = path.join(evidenceDir, "horizon-closeout.json");
      const seeded = await seedEvidence(evidenceDir);
      await seedHorizonStatus(horizonPath, "h1-in-progress");

      const mergePayload = JSON.parse(await readFile(seeded.mergeValidationPath, "utf8")) as {
        checks?: Record<string, unknown>;
      };
      mergePayload.checks = {
        ...(mergePayload.checks ?? {}),
        releaseGoalPolicyValidationPassed: false,
        initialScopeGoalPolicyValidationPassed: false,
      };
      await writeFile(seeded.mergeValidationPath, `${JSON.stringify(mergePayload, null, 2)}\n`, "utf8");

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-horizon-closeout.mjs",
          "--horizon",
          "H1",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--out",
          outputPath,
        ],
        { timeoutMs: 20_000 },
      );
      expect(result.code).toBe(2);
      const payload = JSON.parse(await readFile(outputPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: { requiredEvidence: Array<{ id: string; pass: boolean; checks: string[] }> };
      };
      expect(payload.pass).toBe(false);
      expect(payload.failures).toContain("required_evidence_failed:h1-merge-bundle");
      expect(payload.checks.requiredEvidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "h1-merge-bundle",
            pass: false,
            checks: expect.arrayContaining(["merge_bundle_release_goal_policy_validation_not_passed"]),
          }),
        ]),
      );
    });
  });

  it("fails when H1 is marked completed but active horizon is not H2", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outputPath = path.join(evidenceDir, "horizon-closeout.json");
      await seedEvidence(evidenceDir);
      await seedHorizonStatus(horizonPath, "h1-completed");

      const raw = JSON.parse(await readFile(horizonPath, "utf8")) as Record<string, unknown>;
      raw.activeHorizon = "H1";
      await writeFile(horizonPath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-horizon-closeout.mjs",
          "--horizon",
          "H1",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--require-active-next-horizon",
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
      expect(payload.failures).toContain("active_horizon_not_next:H1");
    });
  });
});
