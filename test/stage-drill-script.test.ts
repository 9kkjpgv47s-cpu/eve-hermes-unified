import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "stage-drill-script-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function seedEvidence(
  evidenceDir: string,
  options?: {
    successRate?: number;
    releasePass?: boolean;
    cutoverPass?: boolean;
    stagePromotionPass?: boolean;
    createFailingLatestSummary?: boolean;
    createFailingLatestRelease?: boolean;
  },
): Promise<{
  summaryPath: string;
  cutoverPath: string;
  releasePath: string;
  stagePromotionPath?: string;
}> {
  await mkdir(evidenceDir, { recursive: true });
  const stamp = "20260426-000000";
  const summaryPath = path.join(evidenceDir, `validation-summary-${stamp}.json`);
  const cutoverPath = path.join(evidenceDir, `cutover-readiness-${stamp}.json`);
  const releasePath = path.join(evidenceDir, `release-readiness-${stamp}.json`);
  const mergeValidationPath = path.join(evidenceDir, `merge-bundle-validation-${stamp}.json`);
  const verifyPath = path.join(evidenceDir, `bundle-verification-${stamp}.json`);

  const successRate = options?.successRate ?? 1;
  const missingTraceRate = successRate >= 0.99 ? 0 : 0.01;
  const unclassifiedFailures = successRate >= 0.99 ? 0 : 1;
  const p95LatencyMs = successRate >= 0.99 ? 400 : 3200;

  await writeFile(
    summaryPath,
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        metrics: {
          successRate,
          missingTraceRate,
          unclassifiedFailures,
          p95LatencyMs,
          failureScenarioPassCount: 5,
        },
        gates: {
          passed:
            successRate >= 0.99 &&
            missingTraceRate <= 0 &&
            unclassifiedFailures <= 0 &&
            p95LatencyMs <= 2500,
          failures: [],
        },
        failureInjectionPreview: [],
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
        pass: options?.cutoverPass !== false,
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
        pass: options?.releasePass !== false,
        files: {
          validationSummary: summaryPath,
          regression: path.join(evidenceDir, `regression-eve-primary-${stamp}.json`),
          cutoverReadiness: cutoverPath,
          failureInjection: path.join(evidenceDir, `failure-injection-${stamp}.txt`),
          soak: path.join(evidenceDir, `soak-${stamp}.jsonl`),
          commandLogDir: path.join(evidenceDir, "release-command-logs"),
          commandsFile: path.join(evidenceDir, "release-command-logs", "commands.json"),
        },
        requiredArtifacts: [],
        releaseCommandLogs: [],
        checks: {
          validationSummaryPassed: successRate >= 0.99,
          regressionPassed: true,
          cutoverReadinessPassed: options?.cutoverPass !== false,
          goalPolicyFileValidationPassed: true,
          goalPolicySourceConsistencyReported: true,
          goalPolicySourceConsistencyPass: true,
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
          bundleManifestPath: path.join(
            evidenceDir,
            "merge-readiness-bundle",
            "merge-readiness-manifest.json",
          ),
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
          releaseGoalPolicySourceConsistencyPass: true,
          releaseGoalPolicySourceConsistencyPassed: true,
          initialScopeGoalPolicyValidationReported: true,
          initialScopeGoalPolicyValidationPassed: true,
          initialScopeGoalPolicySourceConsistencyReported: true,
          initialScopeGoalPolicySourceConsistencyPass: true,
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
      path.join(evidenceDir, "validation-summary-20260426-999999.json"),
      JSON.stringify(
        {
          generatedAtIso: new Date().toISOString(),
          metrics: {
            successRate: 0,
            missingTraceRate: 1,
            unclassifiedFailures: 0,
            p95LatencyMs: 5000,
            failureScenarioPassCount: 0,
          },
          gates: {
            passed: false,
            failures: ["synthetic-failing-summary"],
          },
          failureInjectionPreview: [],
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  if (options?.createFailingLatestRelease === true) {
    await writeFile(
      path.join(evidenceDir, "release-readiness-20260426-999999.json"),
      JSON.stringify(
        {
          readinessVersion: "v1",
          generatedAtIso: new Date().toISOString(),
          defaultValidationCommand: "validate:all",
          pass: false,
          files: {
            validationSummary: summaryPath,
            regression: null,
            cutoverReadiness: cutoverPath,
            failureInjection: null,
            soak: null,
            commandLogDir: null,
            commandsFile: null,
          },
          requiredArtifacts: [],
          releaseCommandLogs: [],
          checks: {
            validationSummaryPassed: false,
            regressionPassed: false,
            cutoverReadinessPassed: false,
            goalPolicyFileValidationPassed: false,
            commandLogsMissing: [],
            discoveredCommandLogs: [],
            requiredReleaseCommands: [],
            missingRequiredCommands: [],
            executedReleaseCommands: [],
            missingCommandLogFiles: [],
            commandFailures: ["synthetic-failing-release"],
            validationCommandsPassed: false,
          },
          failures: ["synthetic-failing-release"],
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  const stagePromotionPath = path.join(evidenceDir, `stage-promotion-readiness-${stamp}.json`);
  await writeFile(
    stagePromotionPath,
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        pass: options?.stagePromotionPass !== false,
        checks: {
          releaseGoalPolicySourceConsistencyReported: true,
          releaseGoalPolicySourceConsistencyPassed: true,
          mergeBundleReleaseGoalPolicyValidationReported: true,
          mergeBundleReleaseGoalPolicyValidationPassed: true,
          mergeBundleReleaseGoalPolicySourceConsistencyReported: true,
          mergeBundleReleaseGoalPolicySourceConsistencyPassed: true,
          mergeBundleGoalPolicySourceConsistencyReported: true,
          mergeBundleGoalPolicySourceConsistencyPassed: true,
          mergeBundleInitialScopeGoalPolicyValidationReported: true,
          mergeBundleInitialScopeGoalPolicyValidationPassed: true,
          bundleVerificationReleaseGoalPolicyValidationReported: true,
          bundleVerificationReleaseGoalPolicyValidationPassed: true,
          bundleVerificationReleaseGoalPolicySourceConsistencyReported: true,
          bundleVerificationReleaseGoalPolicySourceConsistencyPassed: true,
          bundleVerificationGoalPolicySourceConsistencyReported: true,
          bundleVerificationGoalPolicySourceConsistencyPassed: true,
          bundleVerificationInitialScopeGoalPolicyValidationReported: true,
          bundleVerificationInitialScopeGoalPolicyValidationPassed: true,
          mergeBundleGoalPolicyValidationReported: true,
          mergeBundleGoalPolicyValidationPassed: true,
          bundleVerificationGoalPolicyValidationReported: true,
          bundleVerificationGoalPolicyValidationPassed: true,
        },
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
    stagePromotionPath,
  };
}

async function seedHorizonStatus(filePath: string): Promise<void> {
  await writeFile(
    filePath,
    JSON.stringify(
      {
        schemaVersion: "v1",
        updatedAtIso: new Date().toISOString(),
        owner: "cloud-agent",
        activeHorizon: "H2",
        activeStatus: "in_progress",
        summary: "Stage drill integration test",
        blockers: [],
        requiredEvidence: [
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
        ],
        nextActions: [
          {
            id: "h2-drill",
            summary: "Run stage drill",
            targetHorizon: "H2",
            status: "in_progress",
          },
        ],
        horizonStates: {
          H1: {
            status: "completed",
            summary: "H1 complete",
          },
          H2: {
            status: "in_progress",
            summary: "H2 active",
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
        },
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
        history: [
          {
            timestamp: new Date().toISOString(),
            horizon: "H2",
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

async function seedEnvFile(envPath: string): Promise<void> {
  await writeFile(
    envPath,
    [
      "UNIFIED_ROUTER_DEFAULT_PRIMARY=eve",
      "UNIFIED_ROUTER_DEFAULT_FALLBACK=hermes",
      "UNIFIED_ROUTER_FAIL_CLOSED=1",
      "UNIFIED_ROUTER_CUTOVER_STAGE=shadow",
      "UNIFIED_ROUTER_STAGE=shadow",
      "UNIFIED_ROUTER_CANARY_CHAT_IDS=",
      "UNIFIED_ROUTER_MAJORITY_PERCENT=0",
    ].join("\n"),
    "utf8",
  );
}

describe("run-stage-drill.mjs", () => {
  it("passes drill when promotion and rollback policy both hold", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "stage-drill.json");

      await seedEvidence(evidenceDir, { successRate: 1 });
      await seedHorizonStatus(horizonPath);
      await seedEnvFile(envPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/run-stage-drill.mjs",
          "--target-stage",
          "canary",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--canary-chats",
          "101,202",
        ],
        { timeoutMs: 30_000 },
      );
      if (result.code !== 0) {
        throw new Error(`stage-drill failed unexpectedly:\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
      }
      expect(result.code).toBe(0);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        decision: { action: string };
        checks: { promotionPassed: boolean; rollbackPolicyPassed: boolean };
      };
      expect(payload.pass).toBe(true);
      expect(payload.decision.action).toBe("hold");
      expect(payload.checks.promotionPassed).toBe(true);
      expect(payload.checks.rollbackPolicyPassed).toBe(true);
    });
  });

  it("fails drill when rollback policy triggers rollback", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "stage-drill.json");

      await seedEvidence(evidenceDir, { successRate: 0.93 });
      await seedHorizonStatus(horizonPath);
      await seedEnvFile(envPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/run-stage-drill.mjs",
          "--target-stage",
          "canary",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--canary-chats",
          "101,202",
        ],
        { timeoutMs: 30_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        decision: { action: string };
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.decision.action).toBe("rollback");
      expect(payload.failures).toContain("rollback_policy_triggered");
    });
  });

  it("supports dry-run with successful policy hold", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "stage-drill.json");

      await seedEvidence(evidenceDir, { successRate: 1 });
      await seedHorizonStatus(horizonPath);
      await seedEnvFile(envPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/run-stage-drill.mjs",
          "--target-stage",
          "canary",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--dry-run",
        ],
        { timeoutMs: 30_000 },
      );
      expect(result.code).toBe(0);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        dryRun: boolean;
        checks: { promotionPassed: boolean; rollbackPolicyPassed: boolean };
      };
      expect(payload.pass).toBe(true);
      expect(payload.dryRun).toBe(true);
      expect(payload.checks.promotionPassed).toBe(true);
      expect(payload.checks.rollbackPolicyPassed).toBe(true);
    });
  });

  it("pins rollback evaluation to promotion-selected evidence snapshot", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "stage-drill.json");

      await seedEvidence(evidenceDir, {
        successRate: 1,
        createFailingLatestSummary: true,
        createFailingLatestRelease: true,
      });
      await seedHorizonStatus(horizonPath);
      await seedEnvFile(envPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/run-stage-drill.mjs",
          "--target-stage",
          "canary",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--canary-chats",
          "101,202",
        ],
        { timeoutMs: 30_000 },
      );
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: { rollbackPolicyPassed: boolean };
        files: { readinessOut: string; rollbackPolicyOut: string };
        failures?: string[];
      };
      expect(result.code).toBe(2);
      expect(payload.pass).toBe(false);
      expect(payload.checks.rollbackPolicyPassed).toBe(false);
      expect(payload.failures).toContain("stage_promotion_step_failed");
      expect(payload.failures).toContain("rollback_policy_triggered");

      const readinessPayload = JSON.parse(await readFile(payload.files.readinessOut, "utf8")) as {
        files: {
          validationSummary: string;
          cutoverReadiness: string;
          releaseReadiness: string;
          mergeBundleValidation: string;
          bundleVerification: string;
        };
      };
      const rollbackPayload = JSON.parse(await readFile(payload.files.rollbackPolicyOut, "utf8")) as {
        files: {
          validationSummary: string;
          cutoverReadiness: string;
          releaseReadiness: string;
          stagePromotionReadiness: string;
        };
      };

      expect(rollbackPayload.files.validationSummary).toBe(readinessPayload.files.validationSummary);
      expect(rollbackPayload.files.cutoverReadiness).toBe(readinessPayload.files.cutoverReadiness);
      expect(rollbackPayload.files.releaseReadiness).toBe(readinessPayload.files.releaseReadiness);
      expect(rollbackPayload.files.stagePromotionReadiness).toBe(payload.files.readinessOut);
    });
  });

  it("passes with latest-passing evidence mode despite newer failing artifacts", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "stage-drill.json");

      await seedEvidence(evidenceDir, {
        successRate: 1,
        createFailingLatestSummary: true,
        createFailingLatestRelease: true,
      });
      await seedHorizonStatus(horizonPath);
      await seedEnvFile(envPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/run-stage-drill.mjs",
          "--target-stage",
          "canary",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--canary-chats",
          "101,202",
          "--evidence-selection-mode",
          "latest-passing",
        ],
        { timeoutMs: 30_000 },
      );
      if (result.code !== 0) {
        throw new Error(`run-stage-drill latest-passing failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
      }
      expect(result.code).toBe(0);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: { rollbackPolicyPassed: boolean };
      };
      expect(payload.pass).toBe(true);
      expect(payload.checks.rollbackPolicyPassed).toBe(true);
    });
  });

  it("re-evaluates rollback policy and enforces propagated stage checks", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "stage-drill.json");

      const seeded = await seedEvidence(evidenceDir, { successRate: 1 });
      await seedHorizonStatus(horizonPath);
      await seedEnvFile(envPath);

      if (!seeded.stagePromotionPath) {
        throw new Error("missing stage-promotion fixture path");
      }
      const rollbackPolicyPath = path.join(evidenceDir, "broken-rollback-policy.json");
      await writeFile(
        rollbackPolicyPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            decision: {
              action: "hold",
              shouldRollback: false,
              autoApplyRollbackRequested: false,
              rollbackApplied: false,
            },
            checks: {
              stagePromotionMergeBundleGoalPolicyValidationPassed: false,
              stagePromotionBundleVerificationGoalPolicyValidationPassed: false,
            },
            reasons: [],
            triggers: [],
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/run-stage-drill.mjs",
          "--target-stage",
          "canary",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--rollback-policy-out",
          rollbackPolicyPath,
          "--canary-chats",
          "101,202",
        ],
        { timeoutMs: 30_000 },
      );
      expect(result.code).toBe(0);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: {
          rollbackPolicyPassed: boolean;
          rollbackStagePromotionGoalPolicyPropagationReported: boolean;
          rollbackStagePromotionGoalPolicyPropagationPassed: boolean;
        };
      };
      expect(payload.pass).toBe(true);
      expect(payload.failures).toEqual([]);
      expect(payload.checks.rollbackPolicyPassed).toBe(true);
      expect(payload.checks.rollbackStagePromotionGoalPolicyPropagationReported).toBe(true);
      expect(payload.checks.rollbackStagePromotionGoalPolicyPropagationPassed).toBe(true);
    });
  });

  it("fails when stage promotion execution manifest is malformed", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "stage-drill.json");
      const promoteOutPath = path.join(evidenceDir, "stage-promotion-execution-malformed.json");

      await seedEvidence(evidenceDir, { successRate: 1 });
      await seedHorizonStatus(horizonPath);
      await seedEnvFile(envPath);
      await writeFile(
        path.join(evidenceDir, "stage-promotion-readiness-99999999999999.json"),
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            checks: {
              readinessPassed: true,
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
          "scripts/run-stage-drill.mjs",
          "--target-stage",
          "canary",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--canary-chats",
          "101,202",
        ],
        {
          timeoutMs: 30_000,
          env: {
            ...process.env,
            UNIFIED_FORCE_PROMOTE_PAYLOAD_PATH: promoteOutPath,
          },
        },
      );
      expect(result.code).toBe(2);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: {
          promoteSchemaValid: boolean;
        };
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.promoteSchemaValid).toBe(false);
      expect(payload.failures.some((value) => value.startsWith("promote_schema_invalid:"))).toBe(true);
    });
  });
});
