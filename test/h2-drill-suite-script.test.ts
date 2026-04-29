import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "h2-drill-suite-test-"));
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
    p95LatencyMs?: number;
    missingTraceRate?: number;
    unclassifiedFailures?: number;
    releasePass?: boolean;
    cutoverPass?: boolean;
    stagePromotionPass?: boolean;
    createFailingLatestSummary?: boolean;
    createFailingLatestRelease?: boolean;
  },
): Promise<void> {
  await mkdir(evidenceDir, { recursive: true });
  const stamp = "20260426-000000";
  const summaryPath = path.join(evidenceDir, `validation-summary-${stamp}.json`);
  const cutoverPath = path.join(evidenceDir, `cutover-readiness-${stamp}.json`);
  const releasePath = path.join(evidenceDir, `release-readiness-${stamp}.json`);
  const mergeValidationPath = path.join(evidenceDir, `merge-bundle-validation-${stamp}.json`);
  const verifyPath = path.join(evidenceDir, `bundle-verification-${stamp}.json`);

  await writeFile(
    summaryPath,
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        metrics: {
          successRate: options?.successRate ?? 1,
          p95LatencyMs: options?.p95LatencyMs ?? 350,
          missingTraceRate: options?.missingTraceRate ?? 0,
          unclassifiedFailures: options?.unclassifiedFailures ?? 0,
          failureScenarioPassCount: 5,
        },
        gates: {
          passed:
            (options?.successRate ?? 1) >= 0.99 &&
            (options?.missingTraceRate ?? 0) <= 0 &&
            (options?.unclassifiedFailures ?? 0) <= 0 &&
            (options?.p95LatencyMs ?? 350) <= 2500,
          failures: [],
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  await writeFile(
    cutoverPath,
    JSON.stringify({ generatedAtIso: new Date().toISOString(), pass: options?.cutoverPass !== false }, null, 2),
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
          validationSummaryPassed: true,
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
  await writeFile(
    path.join(evidenceDir, `stage-promotion-readiness-${stamp}.json`),
    JSON.stringify(
      {
        pass: options?.stagePromotionPass !== false,
        checks: {
          releaseGoalPolicyValidationReported: true,
          releaseGoalPolicyValidationPassed: true,
          releaseGoalPolicySourceConsistencyReported: true,
          releaseGoalPolicySourceConsistencyPassed: true,
          rollbackStagePromotionGoalPolicyPropagationReported: true,
          rollbackStagePromotionGoalPolicyPropagationPassed: true,
          stagePromotionMergeBundleGoalPolicySourceConsistencyReported: true,
          stagePromotionMergeBundleGoalPolicySourceConsistencyPassed: true,
          stagePromotionBundleVerificationGoalPolicySourceConsistencyReported: true,
          stagePromotionBundleVerificationGoalPolicySourceConsistencyPassed: true,
          stagePromotionMergeBundleGoalPolicyValidationReported: true,
          stagePromotionMergeBundleGoalPolicyValidationPassed: true,
          stagePromotionMergeBundleInitialScopeGoalPolicyValidationReported: true,
          stagePromotionMergeBundleInitialScopeGoalPolicyValidationPassed: true,
          stagePromotionBundleVerificationGoalPolicyValidationReported: true,
          stagePromotionBundleVerificationGoalPolicyValidationPassed: true,
          stagePromotionBundleVerificationInitialScopeGoalPolicyValidationReported: true,
          stagePromotionBundleVerificationInitialScopeGoalPolicyValidationPassed: true,
          mergeBundleGoalPolicyValidationReported: true,
          mergeBundleGoalPolicyValidationPassed: true,
          mergeBundleInitialScopeGoalPolicyValidationReported: true,
          mergeBundleInitialScopeGoalPolicyValidationPassed: true,
          bundleVerificationGoalPolicyValidationReported: true,
          bundleVerificationGoalPolicyValidationPassed: true,
          bundleVerificationInitialScopeGoalPolicyValidationReported: true,
          bundleVerificationInitialScopeGoalPolicyValidationPassed: true,
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
            unclassifiedFailures: 1,
            p95LatencyMs: 5000,
            failureScenarioPassCount: 0,
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
        summary: "H2 drill suite integration test",
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
            id: "h2-action-2",
            summary: "Run majority promotion readiness drill and confirm policy gate behavior under threshold breaches.",
            targetHorizon: "H2",
            status: "in_progress",
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
          H1: { status: "completed", summary: "H1 complete" },
          H2: { status: "in_progress", summary: "H2 active" },
          H3: { status: "planned", summary: "H3 planned" },
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
          H29: { status: "planned", summary: "H29 planned" },
          H30: { status: "planned", summary: "H30 planned" },
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

describe("run-h2-drill-suite.mjs", () => {
  it("passes canary and majority dry-run drills with hold policy", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-drill-suite.json");

      await seedEvidence(evidenceDir);
      await seedHorizonStatus(horizonPath);
      await seedEnvFile(envPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/run-h2-drill-suite.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--runtime-env-file",
          envPath,
          "--out",
          outPath,
          "--canary-chats",
          "100,200",
          "--majority-percent",
          "90",
          "--allow-horizon-mismatch",
        ],
        {
          timeoutMs: 60_000,
          env: {
            ...process.env,
            UNIFIED_FORCE_MALFORMED_STAGE_DRILL_PAYLOADS: "1",
          },
        },
      );
      expect(result.code).toBe(0);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: {
          canaryHoldPass: boolean;
          majorityHoldPass: boolean | null;
          rollbackSimulationPass: boolean | null;
          rollbackSimulationTriggered: boolean | null;
        };
        failures: string[];
      };
      expect(payload.pass).toBe(true);
      expect(payload.checks.canaryHoldPass).toBe(true);
      expect(payload.checks.majorityHoldPass).toBe(true);
      expect(payload.checks.rollbackSimulationPass).toBe(true);
      expect(payload.checks.rollbackSimulationTriggered).toBe(true);
      expect(payload.failures).toEqual([]);
    });
  });

  it("reports rollback simulation trigger when breach thresholds are forced", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-drill-suite.json");

      await seedEvidence(evidenceDir);
      await seedHorizonStatus(horizonPath);
      await seedEnvFile(envPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/run-h2-drill-suite.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--runtime-env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--rollback-force-min-success-rate",
          "1.01",
        ],
        { timeoutMs: 60_000 },
      );
      expect(result.code).toBe(0);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: {
          rollbackSimulationPass: boolean | null;
          rollbackSimulationTriggered: boolean | null;
        };
        failures: string[];
      };
      expect(payload.pass).toBe(true);
      expect(payload.checks.rollbackSimulationPass).toBe(true);
      expect(payload.checks.rollbackSimulationTriggered).toBe(true);
      expect(payload.failures).toEqual([]);
    });
  });

  it("uses latest-passing evidence mode to avoid stale failing artifacts", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-drill-suite.json");

      await seedEvidence(evidenceDir, {
        createFailingLatestSummary: true,
        createFailingLatestRelease: true,
      });
      await seedHorizonStatus(horizonPath);
      await seedEnvFile(envPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/run-h2-drill-suite.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--runtime-env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--evidence-selection-mode",
          "latest-passing",
        ],
        { timeoutMs: 60_000 },
      );
      expect(result.code).toBe(0);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        suite: { evidenceSelectionMode: string };
        checks: { canaryHoldPass: boolean; majorityHoldPass: boolean | null };
      };
      expect(payload.pass).toBe(true);
      expect(payload.suite.evidenceSelectionMode).toBe("latest-passing");
      expect(payload.checks.canaryHoldPass).toBe(true);
      expect(payload.checks.majorityHoldPass).toBe(true);
    });
  });

  it("fails in latest mode when newest evidence artifacts are failing", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-drill-suite.json");

      await seedEvidence(evidenceDir, {
        createFailingLatestSummary: true,
        createFailingLatestRelease: true,
      });
      await seedHorizonStatus(horizonPath);
      await seedEnvFile(envPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/run-h2-drill-suite.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--runtime-env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--evidence-selection-mode",
          "latest",
        ],
        { timeoutMs: 60_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        suite: { evidenceSelectionMode: string };
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.suite.evidenceSelectionMode).toBe("latest");
      expect(payload.failures).toContain("canary_drill_failed");
    });
  });

  it("fails when latest stage-promotion execution artifact schema is malformed", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-drill-suite.json");

      await seedEvidence(evidenceDir);
      await seedHorizonStatus(horizonPath);
      await seedEnvFile(envPath);

      const malformedPromotePath = path.join(
        evidenceDir,
        "stage-promotion-execution-99999999999999.json",
      );
      await writeFile(
        malformedPromotePath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            checks: {},
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
          "scripts/run-h2-drill-suite.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--runtime-env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-majority",
          "--skip-rollback-simulation",
        ],
        {
          timeoutMs: 60_000,
          env: {
            ...process.env,
            UNIFIED_FORCE_MALFORMED_CANARY_STAGE_DRILL: "1",
          },
        },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.failures).toContain("canary_drill_failed");
    });
  });
});
