import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "stage-promotion-readiness-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function seedEvidence(
  evidenceDir: string,
  options?: {
    createFailingLatestSummary?: boolean;
  },
): Promise<{
  summaryPath: string;
  cutoverPath: string;
  releasePath: string;
  mergeValidationPath: string;
  verifyPath: string;
  failingSummaryPath: string;
}> {
  await mkdir(evidenceDir, { recursive: true });
  const stamp = "20260426-000000";
  const summaryPath = path.join(evidenceDir, `validation-summary-${stamp}.json`);
  const cutoverPath = path.join(evidenceDir, `cutover-readiness-${stamp}.json`);
  const releasePath = path.join(evidenceDir, `release-readiness-${stamp}.json`);
  const mergeValidationPath = path.join(evidenceDir, `merge-bundle-validation-${stamp}.json`);
  const verifyPath = path.join(evidenceDir, `bundle-verification-${stamp}.json`);
  const failingSummaryPath = path.join(evidenceDir, "validation-summary-20260426-999999.json");

  await writeFile(
    summaryPath,
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        files: {
          soak: path.join(evidenceDir, "soak.jsonl"),
          failureInjection: path.join(evidenceDir, "failure-injection.txt"),
        },
        metrics: {
          totalRecords: 20,
          successRecords: 20,
          successRate: 1,
          missingTraceCount: 0,
          missingTraceRate: 0,
          unclassifiedFailures: 0,
          p95LatencyMs: 10,
          latencySampleCount: 20,
          failureScenarioPassCount: 5,
        },
        failureScenarios: {
          coveredScenarios: [
            "Eve lane command timeout",
            "Hermes lane non-zero exit",
            "Synthetic provider-limit response mapping",
            "Dispatch-state read mismatch",
            "Policy fail-closed path with no fallback",
          ],
          missingScenarios: [],
          covered: 5,
          required: 5,
        },
        gates: {
          minSuccessRate: 0.99,
          maxMissingTraceRate: 0,
          maxUnclassifiedFailures: 0,
          maxP95LatencyMs: 2500,
          requireFailureScenarios: true,
          passed: true,
          failures: [],
        },
        failureInjectionPreview: [],
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(cutoverPath, JSON.stringify({ pass: true }, null, 2), "utf8");
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
          regression: path.join(evidenceDir, `regression-eve-primary-${stamp}.json`),
          cutoverReadiness: cutoverPath,
          failureInjection: path.join(evidenceDir, `failure-injection-${stamp}.txt`),
          soak: path.join(evidenceDir, `soak-${stamp}.jsonl`),
          goalPolicyFileValidation: null,
          commandLogDir: path.join(evidenceDir, "release-command-logs"),
          commandsFile: path.join(evidenceDir, "release-command-logs", "commands.json"),
        },
        requiredArtifacts: [],
        releaseCommandLogs: [],
        checks: {
          validationSummaryPassed: true,
          regressionPassed: true,
          cutoverReadinessPassed: true,
          goalPolicyFileValidationPassed: true,
          goalPolicySourceConsistencyPassed: true,
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
    mergeValidationPath,
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        pass: true,
        files: {
          validationManifestPath: mergeValidationPath,
          bundleManifestPath: path.join(evidenceDir, "merge-readiness-bundle", "merge-readiness-manifest.json"),
          releaseReadinessPath: releasePath,
          initialScopePath: path.join(evidenceDir, `initial-scope-validation-${stamp}.json`),
          bundleArchivePath: path.join(evidenceDir, "merge-readiness-bundle.tar.gz"),
        },
        checks: {
          buildExitCode: 0,
          bundleManifestPresent: true,
          bundleManifestPass: true,
          releaseGoalPolicyValidationReported: true,
          releaseGoalPolicyValidationPassed: true,
          releaseGoalPolicySourceConsistencyReported: true,
          releaseGoalPolicySourceConsistencyPassed: true,
          initialScopeGoalPolicyValidationReported: true,
          initialScopeGoalPolicyValidationPassed: true,
          initialScopeGoalPolicySourceConsistencyReported: true,
          initialScopeGoalPolicySourceConsistencyPassed: true,
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
        pass: true,
        files: {
          validationManifestPath: mergeValidationPath,
        },
        checks: {
          latestRequested: false,
          latestAliasResolved: false,
          latestAliasFallbackUsed: false,
          validationManifestResolved: true,
          releaseGoalPolicyValidationReported: true,
          releaseGoalPolicyValidationPassed: true,
          releaseGoalPolicySourceConsistencyReported: true,
          releaseGoalPolicySourceConsistencyPassed: true,
          initialScopeGoalPolicyValidationReported: true,
          initialScopeGoalPolicyValidationPassed: true,
          initialScopeGoalPolicySourceConsistencyReported: true,
          initialScopeGoalPolicySourceConsistencyPassed: true,
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  if (options?.createFailingLatestSummary === true) {
    await writeFile(
      failingSummaryPath,
      JSON.stringify(
        {
          generatedAtIso: new Date().toISOString(),
          metrics: {
            successRate: 0.6,
            missingTraceRate: 0.3,
            unclassifiedFailures: 2,
            failureScenarioPassCount: 1,
          },
          gates: {
            passed: false,
            failures: ["synthetic-failing-summary"],
          },
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  return {
    summaryPath,
    cutoverPath,
    releasePath,
    mergeValidationPath,
    verifyPath,
    failingSummaryPath,
  };
}

async function seedHorizonStatus(
  filePath: string,
  targetStage: "canary" | "majority" | "full",
  activeHorizon: "H1" | "H2",
): Promise<void> {
  const requiredEvidence = [
    {
      id: "summary",
      command: "npm run validate:evidence-summary",
      artifactPattern: "evidence/validation-summary-*.json",
      required: true,
    },
    {
      id: "cutover",
      command: "npm run validate:cutover-readiness",
      artifactPattern: "evidence/cutover-readiness-*.json",
      required: true,
    },
    {
      id: "release",
      command: "npm run validate:release-readiness",
      artifactPattern: "evidence/release-readiness-*.json",
      required: true,
    },
    {
      id: "merge-bundle",
      command: "npm run validate:merge-bundle",
      artifactPattern: "evidence/merge-bundle-validation-*.json",
      required: true,
    },
    {
      id: "bundle-verify",
      command: "npm run verify:merge-bundle",
      artifactPattern: "evidence/bundle-verification-*.json",
      required: true,
    },
  ];
  await writeFile(
    filePath,
    JSON.stringify(
      {
        schemaVersion: "v1",
        updatedAtIso: new Date().toISOString(),
        owner: "cloud-agent",
        activeHorizon,
        activeStatus: "in_progress",
        summary: "Promotion readiness integration test",
        blockers: [],
        requiredEvidence,
        nextActions: [
          {
            id: "a1",
            summary: "Run promotion readiness check",
            targetHorizon: activeHorizon,
            status: "in_progress",
          },
        ],
        horizonStates: {
          H1: {
            status: activeHorizon === "H1" ? "in_progress" : "completed",
            summary: "H1 state",
          },
          H2: {
            status: activeHorizon === "H2" ? "in_progress" : "planned",
            summary: "H2 state",
          },
          H3: { status: "planned", summary: "H3 state" },
          H4: { status: "planned", summary: "H4 state" },
          H5: { status: "planned", summary: "H5 state" },
          H6: { status: "planned", summary: "H6 planned" },
          H7: { status: "planned", summary: "H7 planned" },
          H8: { status: "planned", summary: "H8 planned" },
          H9: { status: "planned", summary: "H9 planned" },
          H10: { status: "planned", summary: "H10 planned" },
          H11: { status: "planned", summary: "H11 planned" },
          H12: { status: "planned", summary: "H12 planned" },

          H13: { status: "planned", summary: "H13 planned" },

          H14: { status: "planned", summary: "H14 planned" },
          H15: { status: "planned", summary: "H15 planned" },
          H16: { status: "planned", summary: "H16 planned" },
        },
        promotionReadiness: {
          targetStage,
          gates: {
            releaseReadinessPass: true,
            mergeBundlePass: true,
            bundleVerificationPass: true,
            cutoverReadinessPass: true,
            evidenceSummaryPass: true,
          },
        },
        history: [
          {
            timestamp: new Date().toISOString(),
            horizon: activeHorizon,
            status: "in_progress",
            note: "seed",
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
}

describe("check-stage-promotion-readiness.mjs", () => {
  it("passes when all required gates and artifacts are present", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outputPath = path.join(evidenceDir, "stage-promotion-readiness.json");
      await seedEvidence(evidenceDir);
      await seedHorizonStatus(horizonPath, "canary", "H2");

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/check-stage-promotion-readiness.mjs",
          "--target-stage",
          "canary",
          "--horizon-status-file",
          horizonPath,
          "--evidence-dir",
          evidenceDir,
          "--out",
          outputPath,
        ],
        { timeoutMs: 20_000 },
      );
      if (result.code !== 0) {
        throw new Error(
          `check-stage-promotion-readiness failed unexpectedly\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
        );
      }
      expect(result.code).toBe(0);

      const payload = JSON.parse(await readFile(outputPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: {
          horizonValidationPass: boolean;
          activeHorizon: string;
          stage: string;
          evidenceSelectionMode: string;
          releaseGoalPolicySourceConsistencyPassed: boolean;
          mergeBundleReleaseGoalPolicySourceConsistencyPassed: boolean;
          bundleVerificationReleaseGoalPolicySourceConsistencyPassed: boolean;
        };
      };
      expect(payload.pass).toBe(true);
      expect(payload.failures).toEqual([]);
      expect(payload.checks.horizonValidationPass).toBe(true);
      expect(payload.checks.activeHorizon).toBe("H2");
      expect(payload.checks.stage).toBe("canary");
      expect(payload.checks.evidenceSelectionMode).toBe("latest");
      expect(payload.checks.releaseGoalPolicySourceConsistencyPassed).toBe(true);
      expect(payload.checks.mergeBundleReleaseGoalPolicySourceConsistencyPassed).toBe(true);
      expect(payload.checks.bundleVerificationReleaseGoalPolicySourceConsistencyPassed).toBe(true);
    });
  });

  it("fails when release readiness goal-policy validation is not passed", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outputPath = path.join(evidenceDir, "stage-promotion-readiness.json");
      const seeded = await seedEvidence(evidenceDir);
      const releasePayload = JSON.parse(await readFile(seeded.releasePath, "utf8")) as {
        checks?: Record<string, unknown>;
      };
      releasePayload.checks = {
        ...(releasePayload.checks ?? {}),
        goalPolicyFileValidationPassed: false,
        goalPolicySourceConsistencyPassed: true,
      };
      await writeFile(seeded.releasePath, JSON.stringify(releasePayload, null, 2), "utf8");
      await seedHorizonStatus(horizonPath, "canary", "H2");

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/check-stage-promotion-readiness.mjs",
          "--target-stage",
          "canary",
          "--horizon-status-file",
          horizonPath,
          "--evidence-dir",
          evidenceDir,
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
      expect(payload.failures).toContain("release_goal_policy_validation_not_passed");
    });
  });

  it("fails when merge-bundle goal-policy propagation is missing", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outputPath = path.join(evidenceDir, "stage-promotion-readiness.json");
      const seeded = await seedEvidence(evidenceDir);
      const mergePayload = JSON.parse(await readFile(seeded.mergeValidationPath, "utf8")) as {
        checks?: Record<string, unknown>;
      };
      mergePayload.checks = {
        ...(mergePayload.checks ?? {}),
      };
      delete mergePayload.checks.releaseGoalPolicyValidationReported;
      delete mergePayload.checks.releaseGoalPolicyValidationPassed;
      delete mergePayload.checks.initialScopeGoalPolicyValidationReported;
      delete mergePayload.checks.initialScopeGoalPolicyValidationPassed;
      await writeFile(seeded.mergeValidationPath, JSON.stringify(mergePayload, null, 2), "utf8");
      await seedHorizonStatus(horizonPath, "canary", "H2");

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/check-stage-promotion-readiness.mjs",
          "--target-stage",
          "canary",
          "--horizon-status-file",
          horizonPath,
          "--evidence-dir",
          evidenceDir,
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
      expect(payload.failures).toContain("merge_bundle_release_goal_policy_validation_not_reported");
      expect(payload.failures).toContain(
        "merge_bundle_initial_scope_goal_policy_validation_not_reported",
      );
      expect(payload.failures).toContain("promotion_gate_merge_bundle_not_met");
    });
  });

  it("fails when bundle verification goal-policy propagation is missing", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outputPath = path.join(evidenceDir, "stage-promotion-readiness.json");
      const seeded = await seedEvidence(evidenceDir);
      const verifyPayload = JSON.parse(await readFile(seeded.verifyPath, "utf8")) as {
        checks?: Record<string, unknown>;
      };
      verifyPayload.checks = {
        ...(verifyPayload.checks ?? {}),
      };
      delete verifyPayload.checks.releaseGoalPolicyValidationReported;
      delete verifyPayload.checks.releaseGoalPolicyValidationPassed;
      delete verifyPayload.checks.releaseGoalPolicySourceConsistencyReported;
      delete verifyPayload.checks.releaseGoalPolicySourceConsistencyPassed;
      delete verifyPayload.checks.initialScopeGoalPolicyValidationReported;
      delete verifyPayload.checks.initialScopeGoalPolicyValidationPassed;
      await writeFile(seeded.verifyPath, JSON.stringify(verifyPayload, null, 2), "utf8");
      await seedHorizonStatus(horizonPath, "canary", "H2");

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/check-stage-promotion-readiness.mjs",
          "--target-stage",
          "canary",
          "--horizon-status-file",
          horizonPath,
          "--evidence-dir",
          evidenceDir,
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
      expect(payload.failures).toContain("bundle_verify_release_goal_policy_validation_not_reported");
      expect(payload.failures).toContain("bundle_verify_release_goal_policy_source_consistency_not_reported");
      expect(payload.failures).toContain(
        "bundle_verify_initial_scope_goal_policy_validation_not_reported",
      );
      expect(payload.failures).toContain("promotion_gate_bundle_verification_not_met");
    });
  });

  it("fails when required evidence artifact is missing", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outputPath = path.join(evidenceDir, "stage-promotion-readiness.json");
      const seeded = await seedEvidence(evidenceDir);
      await rm(seeded.cutoverPath, { force: true });
      await seedHorizonStatus(horizonPath, "majority", "H2");

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/check-stage-promotion-readiness.mjs",
          "--target-stage",
          "majority",
          "--horizon-status-file",
          horizonPath,
          "--evidence-dir",
          evidenceDir,
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
      expect(payload.failures.some((item) => item.startsWith("missing_evidence:"))).toBe(true);
    });
  });

  it("fails when stage differs from horizon promotion target", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outputPath = path.join(evidenceDir, "stage-promotion-readiness.json");
      await seedEvidence(evidenceDir, { createFailingLatestSummary: true });
      await seedHorizonStatus(horizonPath, "full", "H2");

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/check-stage-promotion-readiness.mjs",
          "--target-stage",
          "canary",
          "--horizon-status-file",
          horizonPath,
          "--evidence-dir",
          evidenceDir,
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
      expect(payload.failures).toContain("target_stage_mismatch");
    });
  });

  it("accepts artifact patterns when evidence directory is relocated", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "artifacts");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outputPath = path.join(evidenceDir, "stage-promotion-readiness.json");
      await seedEvidence(evidenceDir);
      await seedHorizonStatus(horizonPath, "canary", "H2");

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/check-stage-promotion-readiness.mjs",
          "--target-stage",
          "canary",
          "--horizon-status-file",
          horizonPath,
          "--evidence-dir",
          evidenceDir,
          "--out",
          outputPath,
        ],
        { timeoutMs: 20_000 },
      );
      if (result.code !== 0) {
        throw new Error(
          `check-stage-promotion-readiness relocation case failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
        );
      }
      expect(result.code).toBe(0);

      const payload = JSON.parse(await readFile(outputPath, "utf8")) as {
        pass: boolean;
        failures: string[];
      };
      expect(payload.pass).toBe(true);
      expect(
        payload.failures.some((entry) => entry.startsWith("missing_artifact_pattern_match:")),
      ).toBe(false);
    });
  });

  it("supports selecting latest-passing evidence mode", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outputPath = path.join(evidenceDir, "stage-promotion-readiness.json");
      await seedEvidence(evidenceDir);
      await seedHorizonStatus(horizonPath, "canary", "H2");

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/check-stage-promotion-readiness.mjs",
          "--target-stage",
          "canary",
          "--horizon-status-file",
          horizonPath,
          "--evidence-dir",
          evidenceDir,
          "--evidence-selection-mode",
          "latest-passing",
          "--out",
          outputPath,
        ],
        { timeoutMs: 20_000 },
      );
      expect(result.code).toBe(0);

      const payload = JSON.parse(await readFile(outputPath, "utf8")) as {
        pass: boolean;
        checks: { evidenceSelectionMode: string };
      };
      expect(payload.pass).toBe(true);
      expect(payload.checks.evidenceSelectionMode).toBe("latest-passing");
    });
  });
});
