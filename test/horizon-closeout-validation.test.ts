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
          goalPolicySourceConsistencyReported: true,
          goalPolicySourceConsistencyPass: true,
          goalPolicySourceConsistencyPassed: true,
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
        releaseReadinessGoalPolicySourceConsistencyPass: true,
        checks: {
          uncheckedChecklistItems: [],
          releaseReadinessPassed: true,
              releaseReadinessGoalPolicyValidationPassed: true,
          releaseReadinessGoalPolicySourceConsistencyPassed: true,
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
              releaseGoalPolicySourceConsistencyReported: true,
              releaseGoalPolicySourceConsistencyPass: true,
              releaseGoalPolicySourceConsistencyPassed: true,
              initialScopeGoalPolicyValidationReported: true,
              initialScopeGoalPolicyValidationPassed: true,
              initialScopeGoalPolicySourceConsistencyReported: true,
              initialScopeGoalPolicySourceConsistencyPass: true,
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
          releaseGoalPolicySourceConsistencyReported: true,
          releaseGoalPolicySourceConsistencyPass: true,
          releaseGoalPolicySourceConsistencyPassed: true,
          initialScopePass: true,
          initialScopeGoalPolicyValidationReported: true,
          initialScopeGoalPolicyValidationPassed: true,
          initialScopeGoalPolicySourceConsistencyReported: true,
          initialScopeGoalPolicySourceConsistencyPass: true,
          initialScopeGoalPolicySourceConsistencyPassed: true,
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
          releaseGoalPolicySourceConsistencyReported: true,
          releaseGoalPolicySourceConsistencyPassed: true,
          mergeBundleValidationPassed: true,
          mergeBundleReleaseGoalPolicySourceConsistencyReported: true,
          mergeBundleReleaseGoalPolicySourceConsistencyPassed: true,
          bundleVerificationPassed: true,
          bundleVerificationReleaseGoalPolicySourceConsistencyReported: true,
          bundleVerificationReleaseGoalPolicySourceConsistencyPassed: true,
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
          H17: { status: "planned", summary: "H17 planned" },
          H18: { status: "planned", summary: "H18 planned" },
          H19: { status: "planned", summary: "H19 planned" },
          H20: { status: "planned", summary: "H20 planned" },
          H21: { status: "planned", summary: "H21 planned" },
          H22: { status: "planned", summary: "H22 planned" },
        H23: { status: "planned", summary: "H23 planned" },
        H24: { status: "planned", summary: "H24 planned" },
        H25: { status: "planned", summary: "H25 planned" },
        H26: { status: "planned", summary: "H26 planned" },
        H27: { status: "planned", summary: "H27 planned" },
        H28: { status: "planned", summary: "H28 planned" },
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

async function seedH3H4SpecificEvidence(evidenceDir: string): Promise<void> {
  const stamp = "20260426-000123";
  await writeFile(
    path.join(evidenceDir, `horizon-closeout-run-H3-${stamp}.json`),
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        pass: true,
        horizon: {
          source: "H3",
          next: "H4",
        },
        checks: {
          horizonCloseoutGatePass: true,
          h2CloseoutGatePass: true,
          supervisedSimulationPass: true,
          supervisedSimulationStageGoalPolicyPropagationReported: true,
          supervisedSimulationStageGoalPolicyPropagationPassed: true,
          supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
          supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
        },
        files: {
          closeoutOut: path.join(evidenceDir, "horizon-closeout-H3-seeded.json"),
        },
        failures: [],
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(
    path.join(evidenceDir, `horizon-promotion-run-H3-${stamp}.json`),
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        pass: true,
        horizon: {
          source: "H3",
          next: "H4",
        },
        files: {
          evidenceDir,
          horizonStatusFile: path.join(evidenceDir, "HORIZON_STATUS.json"),
          outPath: path.join(evidenceDir, `horizon-promotion-run-H3-${stamp}.json`),
        },
        checks: {
          closeoutRunPass: true,
          closeoutGatePass: true,
          closeoutRunSchemaValid: true,
          closeoutRunCloseoutArtifactSchemaValid: true,
          closeoutRunH2CloseoutGateReported: true,
          closeoutRunH2CloseoutGatePass: true,
          closeoutRunSupervisedSimulationStageGoalPolicyPropagationReported: true,
          closeoutRunSupervisedSimulationStageGoalPolicyPropagationPassed: true,
          closeoutRunSupervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
          closeoutRunSupervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
          horizonPromotionPass: true,
          sourceHorizon: "H3",
          nextHorizon: "H4",
        },
        failures: [],
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

  it("fails when stage-promotion artifact schema is invalid", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outputPath = path.join(evidenceDir, "horizon-closeout.json");
      const seeded = await seedEvidence(evidenceDir);
      await seedHorizonStatus(horizonPath, "h1-in-progress");

      const invalidStagePromotionPayload = JSON.stringify(
        {
          generatedAtIso: new Date().toISOString(),
          pass: true,
          checks: {
            releaseGoalPolicySourceConsistencyReported: true,
            releaseGoalPolicySourceConsistencyPassed: true,
            mergeBundleReleaseGoalPolicySourceConsistencyReported: true,
            mergeBundleReleaseGoalPolicySourceConsistencyPassed: true,
            bundleVerificationReleaseGoalPolicySourceConsistencyReported: true,
            bundleVerificationReleaseGoalPolicySourceConsistencyPassed: true,
          },
          failures: [],
        },
        null,
        2,
      );
      await writeFile(seeded.stagePromotionPath, `${invalidStagePromotionPayload}\n`, "utf8");

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
        checks: {
          stagePromotionSchemaValid: boolean;
          stagePromotionSchemaErrors: string[] | null;
          stagePromotionPassed: boolean;
          stagePromotionEvidence: {
            checks: string[];
          };
        };
      };
      expect(payload.pass).toBe(false);
      expect(payload.failures).toContain("stage_promotion_schema_invalid");
      expect(payload.checks.stagePromotionSchemaValid).toBe(false);
      expect(payload.checks.stagePromotionSchemaErrors).toEqual(
        expect.arrayContaining(["stage must be an object"]),
      );
      expect(payload.checks.stagePromotionPassed).toBe(false);
      expect(payload.checks.stagePromotionEvidence.checks).toEqual(
        expect.arrayContaining(["stage_promotion_schema_invalid:stage must be an object"]),
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

  it("passes when H3 closeout requires generalized horizon run artifacts", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outputPath = path.join(evidenceDir, "h3-closeout.json");
      await seedEvidence(evidenceDir);
      await seedH3H4SpecificEvidence(evidenceDir);

      await writeFile(
        horizonPath,
        JSON.stringify(
          {
            schemaVersion: "v1",
            updatedAtIso: new Date().toISOString(),
            owner: "cloud-agent",
            activeHorizon: "H3",
            activeStatus: "in_progress",
            summary: "H3 closeout fixture",
            blockers: [],
            requiredEvidence: [
              {
                id: "h1-release-readiness",
                command: "npm run validate:release-readiness",
                artifactPattern: "evidence/release-readiness-*.json",
                required: true,
              },
              {
                id: "h1-cutover-readiness",
                command: "npm run validate:cutover-readiness",
                artifactPattern: "evidence/cutover-readiness-*.json",
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
                id: "h3-closeout-run",
                command: "npm run run:h3-closeout",
                artifactPattern: "evidence/horizon-closeout-run-H3-*.json",
                required: true,
                horizons: ["H3"],
              },
              {
                id: "h3-promotion-run",
                command: "npm run run:h3-promotion",
                artifactPattern: "evidence/horizon-promotion-run-H3-*.json",
                required: true,
                horizons: ["H3"],
              },
            ],
            nextActions: [
              {
                id: "h3-action-1",
                summary: "closeout fixture action",
                targetHorizon: "H3",
                status: "completed",
              },
            ],
            promotionReadiness: {
              targetStage: "full",
              gates: {
                releaseReadinessPass: true,
                mergeBundlePass: true,
                bundleVerificationPass: true,
                cutoverReadinessPass: true,
                evidenceSummaryPass: true,
              },
            },
            horizonStates: {
              H1: { status: "completed", summary: "H1 complete" },
              H2: { status: "completed", summary: "H2 complete" },
              H3: { status: "in_progress", summary: "H3 active" },
              H4: { status: "planned", summary: "H4 planned" },
              H5: { status: "planned", summary: "H5 planned" },
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
          H17: { status: "planned", summary: "H17 planned" },
          H18: { status: "planned", summary: "H18 planned" },
          H19: { status: "planned", summary: "H19 planned" },
          H20: { status: "planned", summary: "H20 planned" },
          H21: { status: "planned", summary: "H21 planned" },
          H22: { status: "planned", summary: "H22 planned" },
        H23: { status: "planned", summary: "H23 planned" },
        H24: { status: "planned", summary: "H24 planned" },
        H25: { status: "planned", summary: "H25 planned" },
        H26: { status: "planned", summary: "H26 planned" },
        H27: { status: "planned", summary: "H27 planned" },
        H28: { status: "planned", summary: "H28 planned" },
        },
            history: [
              {
                timestamp: new Date().toISOString(),
                horizon: "H3",
                status: "in_progress",
                note: "seed fixture",
              },
            ],
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-horizon-closeout.mjs",
          "--horizon",
          "H3",
          "--next-horizon",
          "H4",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--allow-horizon-mismatch",
          "--out",
          outputPath,
        ],
        { timeoutMs: 30_000 },
      );
      if (result.code !== 0) {
        throw new Error(
          `expected H3 closeout pass but got code=${String(result.code)}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
        );
      }
      expect(result.code).toBe(0);
      const payload = JSON.parse(await readFile(outputPath, "utf8")) as {
        pass: boolean;
        checks: { requiredEvidence: Array<{ id: string; pass: boolean }> };
      };
      expect(payload.pass).toBe(true);
      expect(
        payload.checks.requiredEvidence.some(
          (item) => item.id === "h3-closeout-run" && item.pass === true,
        ),
      ).toBe(true);
      expect(
        payload.checks.requiredEvidence.some(
          (item) => item.id === "h3-promotion-run" && item.pass === true,
        ),
      ).toBe(true);
    });
  });

  it("fails when H3 closeout-run artifact omits supervised stage propagation signals", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outputPath = path.join(evidenceDir, "h3-closeout.json");
      await seedEvidence(evidenceDir);
      await seedH3H4SpecificEvidence(evidenceDir);

      await writeFile(
        horizonPath,
        JSON.stringify(
          {
            schemaVersion: "v1",
            updatedAtIso: new Date().toISOString(),
            owner: "cloud-agent",
            activeHorizon: "H3",
            activeStatus: "in_progress",
            summary: "H3 closeout fixture",
            blockers: [],
            requiredEvidence: [
              {
                id: "h1-release-readiness",
                command: "npm run validate:release-readiness",
                artifactPattern: "evidence/release-readiness-*.json",
                required: true,
              },
              {
                id: "h1-cutover-readiness",
                command: "npm run validate:cutover-readiness",
                artifactPattern: "evidence/cutover-readiness-*.json",
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
                id: "h3-closeout-run",
                command: "npm run run:h3-closeout",
                artifactPattern: "evidence/horizon-closeout-run-H3-*.json",
                required: true,
                horizons: ["H3"],
              },
            ],
            nextActions: [
              {
                id: "h3-action-1",
                summary: "closeout fixture action",
                targetHorizon: "H3",
                status: "completed",
              },
            ],
            promotionReadiness: {
              targetStage: "full",
              gates: {
                releaseReadinessPass: true,
                mergeBundlePass: true,
                bundleVerificationPass: true,
                cutoverReadinessPass: true,
                evidenceSummaryPass: true,
              },
            },
            horizonStates: {
              H1: { status: "completed", summary: "H1 complete" },
              H2: { status: "completed", summary: "H2 complete" },
              H3: { status: "in_progress", summary: "H3 active" },
              H4: { status: "planned", summary: "H4 planned" },
              H5: { status: "planned", summary: "H5 planned" },
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
          H17: { status: "planned", summary: "H17 planned" },
          H18: { status: "planned", summary: "H18 planned" },
          H19: { status: "planned", summary: "H19 planned" },
          H20: { status: "planned", summary: "H20 planned" },
          H21: { status: "planned", summary: "H21 planned" },
          H22: { status: "planned", summary: "H22 planned" },
        H23: { status: "planned", summary: "H23 planned" },
        H24: { status: "planned", summary: "H24 planned" },
        H25: { status: "planned", summary: "H25 planned" },
        H26: { status: "planned", summary: "H26 planned" },
        H27: { status: "planned", summary: "H27 planned" },
        H28: { status: "planned", summary: "H28 planned" },
        },
            history: [
              {
                timestamp: new Date().toISOString(),
                horizon: "H3",
                status: "in_progress",
                note: "seed fixture",
              },
            ],
          },
          null,
          2,
        ),
        "utf8",
      );

      const closeoutRunPath = path.join(evidenceDir, "horizon-closeout-run-H3-20260426-000123.json");
      const closeoutRunPayload = JSON.parse(await readFile(closeoutRunPath, "utf8")) as {
        checks?: Record<string, unknown>;
      };
      closeoutRunPayload.checks = {
        ...(closeoutRunPayload.checks ?? {}),
      };
      delete closeoutRunPayload.checks.supervisedSimulationStageGoalPolicyPropagationReported;
      delete closeoutRunPayload.checks.supervisedSimulationStageGoalPolicyPropagationPassed;
      await writeFile(closeoutRunPath, `${JSON.stringify(closeoutRunPayload, null, 2)}\n`, "utf8");

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-horizon-closeout.mjs",
          "--horizon",
          "H3",
          "--next-horizon",
          "H4",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--allow-horizon-mismatch",
          "--out",
          outputPath,
        ],
        { timeoutMs: 30_000 },
      );
      expect(result.code).toBe(2);
      const payload = JSON.parse(await readFile(outputPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: {
          requiredEvidence: Array<{ id: string; pass: boolean; checks: string[] }>;
        };
      };
      expect(payload.pass).toBe(false);
      expect(payload.failures).toContain("required_evidence_failed:h3-closeout-run");
      expect(payload.checks.requiredEvidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "h3-closeout-run",
            pass: false,
            checks: expect.arrayContaining([
              "horizon_closeout_run_supervised_stage_goal_policy_not_reported",
            ]),
          }),
        ]),
      );
    });
  });

  it("fails when H3 promotion-run artifact omits closeout-run gate pass signal", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outputPath = path.join(evidenceDir, "h3-closeout.json");
      await seedEvidence(evidenceDir);
      await seedH3H4SpecificEvidence(evidenceDir);

      await writeFile(
        horizonPath,
        JSON.stringify(
          {
            schemaVersion: "v1",
            updatedAtIso: new Date().toISOString(),
            owner: "cloud-agent",
            activeHorizon: "H3",
            activeStatus: "in_progress",
            summary: "H3 closeout fixture",
            blockers: [],
            requiredEvidence: [
              {
                id: "h1-release-readiness",
                command: "npm run validate:release-readiness",
                artifactPattern: "evidence/release-readiness-*.json",
                required: true,
              },
              {
                id: "h1-cutover-readiness",
                command: "npm run validate:cutover-readiness",
                artifactPattern: "evidence/cutover-readiness-*.json",
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
                id: "h3-promotion-run",
                command: "npm run run:h3-promotion",
                artifactPattern: "evidence/horizon-promotion-run-H3-*.json",
                required: true,
                horizons: ["H3"],
              },
            ],
            nextActions: [
              {
                id: "h3-action-1",
                summary: "closeout fixture action",
                targetHorizon: "H3",
                status: "completed",
              },
            ],
            promotionReadiness: {
              targetStage: "full",
              gates: {
                releaseReadinessPass: true,
                mergeBundlePass: true,
                bundleVerificationPass: true,
                cutoverReadinessPass: true,
                evidenceSummaryPass: true,
              },
            },
            horizonStates: {
              H1: { status: "completed", summary: "H1 complete" },
              H2: { status: "completed", summary: "H2 complete" },
              H3: { status: "in_progress", summary: "H3 active" },
              H4: { status: "planned", summary: "H4 planned" },
              H5: { status: "planned", summary: "H5 planned" },
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
          H17: { status: "planned", summary: "H17 planned" },
          H18: { status: "planned", summary: "H18 planned" },
          H19: { status: "planned", summary: "H19 planned" },
          H20: { status: "planned", summary: "H20 planned" },
          H21: { status: "planned", summary: "H21 planned" },
          H22: { status: "planned", summary: "H22 planned" },
        H23: { status: "planned", summary: "H23 planned" },
        H24: { status: "planned", summary: "H24 planned" },
        H25: { status: "planned", summary: "H25 planned" },
        H26: { status: "planned", summary: "H26 planned" },
        H27: { status: "planned", summary: "H27 planned" },
        H28: { status: "planned", summary: "H28 planned" },
        },
            history: [
              {
                timestamp: new Date().toISOString(),
                horizon: "H3",
                status: "in_progress",
                note: "seed fixture",
              },
            ],
          },
          null,
          2,
        ),
        "utf8",
      );

      const promotionRunPath = path.join(evidenceDir, "horizon-promotion-run-H3-20260426-000123.json");
      const promotionRunPayload = JSON.parse(await readFile(promotionRunPath, "utf8")) as {
        checks?: Record<string, unknown>;
      };
      promotionRunPayload.checks = {
        ...(promotionRunPayload.checks ?? {}),
      };
      delete promotionRunPayload.checks.closeoutRunPass;
      await writeFile(promotionRunPath, `${JSON.stringify(promotionRunPayload, null, 2)}\n`, "utf8");

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-horizon-closeout.mjs",
          "--horizon",
          "H3",
          "--next-horizon",
          "H4",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--allow-horizon-mismatch",
          "--out",
          outputPath,
        ],
        { timeoutMs: 30_000 },
      );
      expect(result.code).toBe(2);
      const payload = JSON.parse(await readFile(outputPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: {
          requiredEvidence: Array<{ id: string; pass: boolean; checks: string[] }>;
        };
      };
      expect(payload.pass).toBe(false);
      expect(payload.failures).toContain("required_evidence_failed:h3-promotion-run");
      expect(payload.checks.requiredEvidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "h3-promotion-run",
            pass: false,
            checks: expect.arrayContaining(["horizon_promotion_run_closeout_run_pass_not_reported"]),
          }),
        ]),
      );
    });
  });

  it("passes when H3 closeout requires generic horizon runner command artifacts", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outputPath = path.join(evidenceDir, "h3-closeout-generic-runner.json");
      await seedEvidence(evidenceDir);
      await seedH3H4SpecificEvidence(evidenceDir);

      await writeFile(
        horizonPath,
        JSON.stringify(
          {
            schemaVersion: "v1",
            updatedAtIso: new Date().toISOString(),
            owner: "cloud-agent",
            activeHorizon: "H3",
            activeStatus: "in_progress",
            summary: "H3 closeout fixture with generic runner commands",
            blockers: [],
            requiredEvidence: [
              {
                id: "h1-release-readiness",
                command: "npm run validate:release-readiness",
                artifactPattern: "evidence/release-readiness-*.json",
                required: true,
              },
              {
                id: "h1-cutover-readiness",
                command: "npm run validate:cutover-readiness",
                artifactPattern: "evidence/cutover-readiness-*.json",
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
                id: "h3-closeout-run-generic",
                command: "npm run run:horizon-closeout -- --horizon H3 --next-horizon H4",
                artifactPattern: "evidence/horizon-closeout-run-H3-*.json",
                required: true,
                horizons: ["H3"],
              },
              {
                id: "h3-promotion-run-generic",
                command: "npm run run:horizon-promotion -- --horizon H3 --next-horizon H4",
                artifactPattern: "evidence/horizon-promotion-run-H3-*.json",
                required: true,
                horizons: ["H3"],
              },
            ],
            nextActions: [
              {
                id: "h3-action-1",
                summary: "closeout fixture action",
                targetHorizon: "H3",
                status: "completed",
              },
            ],
            promotionReadiness: {
              targetStage: "full",
              gates: {
                releaseReadinessPass: true,
                mergeBundlePass: true,
                bundleVerificationPass: true,
                cutoverReadinessPass: true,
                evidenceSummaryPass: true,
              },
            },
            horizonStates: {
              H1: { status: "completed", summary: "H1 complete" },
              H2: { status: "completed", summary: "H2 complete" },
              H3: { status: "in_progress", summary: "H3 active" },
              H4: { status: "planned", summary: "H4 planned" },
              H5: { status: "planned", summary: "H5 planned" },
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
          H17: { status: "planned", summary: "H17 planned" },
          H18: { status: "planned", summary: "H18 planned" },
          H19: { status: "planned", summary: "H19 planned" },
          H20: { status: "planned", summary: "H20 planned" },
          H21: { status: "planned", summary: "H21 planned" },
          H22: { status: "planned", summary: "H22 planned" },
        H23: { status: "planned", summary: "H23 planned" },
        H24: { status: "planned", summary: "H24 planned" },
        H25: { status: "planned", summary: "H25 planned" },
        H26: { status: "planned", summary: "H26 planned" },
        H27: { status: "planned", summary: "H27 planned" },
        H28: { status: "planned", summary: "H28 planned" },
        },
            history: [
              {
                timestamp: new Date().toISOString(),
                horizon: "H3",
                status: "in_progress",
                note: "seed fixture",
              },
            ],
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-horizon-closeout.mjs",
          "--horizon",
          "H3",
          "--next-horizon",
          "H4",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--allow-horizon-mismatch",
          "--out",
          outputPath,
        ],
        { timeoutMs: 30_000 },
      );
      expect(result.code).toBe(0);
      const payload = JSON.parse(await readFile(outputPath, "utf8")) as {
        pass: boolean;
        checks: { requiredEvidence: Array<{ id: string; pass: boolean }> };
      };
      expect(payload.pass).toBe(true);
      expect(
        payload.checks.requiredEvidence.some(
          (item) => item.id === "h3-closeout-run-generic" && item.pass === true,
        ),
      ).toBe(true);
      expect(
        payload.checks.requiredEvidence.some(
          (item) => item.id === "h3-promotion-run-generic" && item.pass === true,
        ),
      ).toBe(true);
    });
  });

  it("fails when generic horizon runner command transition mismatches required horizon", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outputPath = path.join(evidenceDir, "h3-closeout-generic-runner-mismatch.json");
      await seedEvidence(evidenceDir);
      await seedH3H4SpecificEvidence(evidenceDir);

      await writeFile(
        horizonPath,
        JSON.stringify(
          {
            schemaVersion: "v1",
            updatedAtIso: new Date().toISOString(),
            owner: "cloud-agent",
            activeHorizon: "H3",
            activeStatus: "in_progress",
            summary: "H3 closeout fixture with generic runner mismatch",
            blockers: [],
            requiredEvidence: [
              {
                id: "h1-release-readiness",
                command: "npm run validate:release-readiness",
                artifactPattern: "evidence/release-readiness-*.json",
                required: true,
              },
              {
                id: "h1-cutover-readiness",
                command: "npm run validate:cutover-readiness",
                artifactPattern: "evidence/cutover-readiness-*.json",
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
                id: "h3-closeout-run-generic-mismatch",
                command: "npm run run:horizon-closeout -- --horizon H3 --next-horizon H5",
                artifactPattern: "evidence/horizon-closeout-run-H3-*.json",
                required: true,
                horizons: ["H3"],
              },
            ],
            nextActions: [
              {
                id: "h3-action-1",
                summary: "closeout fixture action",
                targetHorizon: "H3",
                status: "completed",
              },
            ],
            promotionReadiness: {
              targetStage: "full",
              gates: {
                releaseReadinessPass: true,
                mergeBundlePass: true,
                bundleVerificationPass: true,
                cutoverReadinessPass: true,
                evidenceSummaryPass: true,
              },
            },
            horizonStates: {
              H1: { status: "completed", summary: "H1 complete" },
              H2: { status: "completed", summary: "H2 complete" },
              H3: { status: "in_progress", summary: "H3 active" },
              H4: { status: "planned", summary: "H4 planned" },
              H5: { status: "planned", summary: "H5 planned" },
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
          H17: { status: "planned", summary: "H17 planned" },
          H18: { status: "planned", summary: "H18 planned" },
          H19: { status: "planned", summary: "H19 planned" },
          H20: { status: "planned", summary: "H20 planned" },
          H21: { status: "planned", summary: "H21 planned" },
          H22: { status: "planned", summary: "H22 planned" },
        H23: { status: "planned", summary: "H23 planned" },
        H24: { status: "planned", summary: "H24 planned" },
        H25: { status: "planned", summary: "H25 planned" },
        H26: { status: "planned", summary: "H26 planned" },
        H27: { status: "planned", summary: "H27 planned" },
        H28: { status: "planned", summary: "H28 planned" },
        },
            history: [
              {
                timestamp: new Date().toISOString(),
                horizon: "H3",
                status: "in_progress",
                note: "seed fixture",
              },
            ],
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-horizon-closeout.mjs",
          "--horizon",
          "H3",
          "--next-horizon",
          "H4",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--allow-horizon-mismatch",
          "--out",
          outputPath,
        ],
        { timeoutMs: 30_000 },
      );
      expect(result.code).toBe(2);
      const payload = JSON.parse(await readFile(outputPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: {
          requiredEvidence: Array<{ id: string; pass: boolean; checks: string[] }>;
        };
      };
      expect(payload.pass).toBe(false);
      expect(payload.failures).toContain("required_evidence_failed:h3-closeout-run-generic-mismatch");
      expect(payload.checks.requiredEvidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "h3-closeout-run-generic-mismatch",
            pass: false,
            checks: expect.arrayContaining([
              "horizon_closeout_run_next_horizon_mismatch:H4!=H5",
            ]),
          }),
        ]),
      );
    });
  });
});
