import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "supervised-rollback-sim-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function seedValidationSummaries(evidenceDir: string): Promise<void> {
  await mkdir(evidenceDir, { recursive: true });
  const entries = [
    {
      stamp: "20260426-000001",
      successRate: 0.9992,
      p95LatencyMs: 600,
      passed: true,
    },
    {
      stamp: "20260426-000002",
      successRate: 0.9988,
      p95LatencyMs: 720,
      passed: true,
    },
    {
      stamp: "20260426-000003",
      successRate: 0.9994,
      p95LatencyMs: 540,
      passed: true,
    },
  ];
  for (const entry of entries) {
    await writeFile(
      path.join(evidenceDir, `validation-summary-${entry.stamp}.json`),
      JSON.stringify(
        {
          generatedAtIso: new Date().toISOString(),
          metrics: {
            successRate: entry.successRate,
            missingTraceRate: 0,
            unclassifiedFailures: 0,
            p95LatencyMs: entry.p95LatencyMs,
            failureScenarioPassCount: 5,
          },
          gates: {
            passed: entry.passed,
            failures: entry.passed ? [] : ["seed-failure"],
          },
        },
        null,
        2,
      ),
      "utf8",
    );
  }
}

async function seedReadinessArtifacts(evidenceDir: string): Promise<void> {
  const stamp = "20260426-000000";
  const validationSummary = path.join(evidenceDir, "validation-summary-20260426-000003.json");
  await writeFile(
    path.join(evidenceDir, `cutover-readiness-${stamp}.json`),
    JSON.stringify({ generatedAtIso: new Date().toISOString(), pass: true }, null, 2),
    "utf8",
  );
  await writeFile(
    path.join(evidenceDir, `release-readiness-${stamp}.json`),
    JSON.stringify(
      {
        readinessVersion: "v1",
        generatedAtIso: new Date().toISOString(),
        defaultValidationCommand: "validate:all",
        pass: true,
        files: {
          validationSummary,
          regression: null,
          cutoverReadiness: path.join(evidenceDir, `cutover-readiness-${stamp}.json`),
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
    path.join(evidenceDir, `merge-bundle-validation-${stamp}.json`),
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        pass: true,
        files: {
          validationManifestPath: path.join(evidenceDir, `merge-bundle-validation-${stamp}.json`),
          bundleManifestPath: "/tmp/merge-readiness-manifest.json",
          releaseReadinessPath: path.join(evidenceDir, `release-readiness-${stamp}.json`),
          initialScopePath: "/tmp/initial-scope-validation.json",
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
    path.join(evidenceDir, `bundle-verification-${stamp}.json`),
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        pass: true,
        files: {
          validationManifestPath: path.join(evidenceDir, `merge-bundle-validation-${stamp}.json`),
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
  await writeFile(
    path.join(evidenceDir, `stage-promotion-readiness-${stamp}.json`),
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        pass: true,
        files: {
          validationSummary,
          cutoverReadiness: path.join(evidenceDir, `cutover-readiness-${stamp}.json`),
          releaseReadiness: path.join(evidenceDir, `release-readiness-${stamp}.json`),
          mergeBundleValidation: path.join(evidenceDir, `merge-bundle-validation-${stamp}.json`),
          bundleVerification: path.join(evidenceDir, `bundle-verification-${stamp}.json`),
        },
        checks: {
          validationSummaryPassed: true,
          cutoverReadinessPassed: true,
          releaseReadinessPassed: true,
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
          mergeBundleValidationPassed: true,
          bundleVerificationPassed: true,
          horizonValidationPass: true,
          activeHorizon: "H2",
          activeStatus: "in_progress",
          stage: "majority",
        },
        failures: [],
      },
      null,
      2,
    ),
    "utf8",
  );

  await writeFile(
    path.join(evidenceDir, "release-readiness-20260426-999999.json"),
    JSON.stringify(
      {
        readinessVersion: "v1",
        generatedAtIso: new Date().toISOString(),
        defaultValidationCommand: "validate:all",
        pass: false,
        files: {
          validationSummary: validationSummary,
          regression: null,
          cutoverReadiness: path.join(evidenceDir, `cutover-readiness-${stamp}.json`),
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

  await writeFile(
    path.join(evidenceDir, "stage-promotion-readiness-20260426-999999.json"),
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        pass: false,
        checks: {
          validationSummaryPassed: false,
          cutoverReadinessPassed: false,
          releaseReadinessPassed: false,
          mergeBundleReleaseGoalPolicyValidationReported: false,
          mergeBundleReleaseGoalPolicyValidationPassed: false,
          mergeBundleInitialScopeGoalPolicyValidationReported: false,
          mergeBundleInitialScopeGoalPolicyValidationPassed: false,
          bundleVerificationReleaseGoalPolicyValidationReported: false,
          bundleVerificationReleaseGoalPolicyValidationPassed: false,
          bundleVerificationInitialScopeGoalPolicyValidationReported: false,
          bundleVerificationInitialScopeGoalPolicyValidationPassed: false,
          mergeBundleGoalPolicyValidationReported: false,
          mergeBundleGoalPolicyValidationPassed: false,
          bundleVerificationGoalPolicyValidationReported: false,
          bundleVerificationGoalPolicyValidationPassed: false,
          mergeBundleValidationPassed: false,
          bundleVerificationPassed: false,
          horizonValidationPass: false,
          activeHorizon: "H2",
          activeStatus: "in_progress",
          stage: "majority",
        },
        failures: ["synthetic-failing-stage-promotion"],
      },
      null,
      2,
    ),
    "utf8",
  );
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
        summary: "supervised rollback simulation test",
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
            id: "h2-action-sim",
            summary: "simulate supervised rollback",
            targetHorizon: "H2",
            status: "in_progress",
          },
        ],
        promotionReadiness: {
          targetStage: "majority",
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
          H31: { status: "planned", summary: "H31 planned" },
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

async function seedEnvFile(filePath: string): Promise<void> {
  await writeFile(
    filePath,
    [
      "UNIFIED_ROUTER_DEFAULT_PRIMARY=eve",
      "UNIFIED_ROUTER_DEFAULT_FALLBACK=hermes",
      "UNIFIED_ROUTER_FAIL_CLOSED=1",
      "UNIFIED_ROUTER_CUTOVER_STAGE=canary",
      "UNIFIED_ROUTER_STAGE=canary",
      "UNIFIED_ROUTER_CANARY_CHAT_IDS=100,200",
      "UNIFIED_ROUTER_MAJORITY_PERCENT=0",
      "HERMES_LAUNCH_COMMAND=/bin/true",
      "HERMES_LAUNCH_ARGS=",
      "EVE_TASK_DISPATCH_SCRIPT=/bin/true",
      "EVE_DISPATCH_RESULT_PATH=/tmp/eve-dispatch-result.json",
      "UNIFIED_MEMORY_STORE_KIND=file",
      "UNIFIED_MEMORY_FILE_PATH=/tmp/eve-hermes-unified-memory.json",
    ].join("\n"),
    "utf8",
  );
}

describe("run-supervised-rollback-simulation.mjs", () => {
  it("runs simulated rollback flow and emits unified evidence report", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "supervised-rollback-simulation.json");

      await seedValidationSummaries(evidenceDir);
      await seedReadinessArtifacts(evidenceDir);
      await seedHorizonStatus(horizonPath);
      await seedEnvFile(envPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/run-supervised-rollback-simulation.mjs",
          "--stage",
          "majority",
          "--current-stage",
          "canary",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--majority-percent",
          "90",
          "--force-rollback-min-success-rate",
          "1.01",
          "--timeout-ms",
          "120000",
        ],
        { timeoutMs: 130_000 },
      );
      if (result.code !== 0) {
        throw new Error(
          `run-supervised-rollback-simulation failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
        );
      }
      expect(result.code).toBe(0);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: {
          calibrationPass: boolean;
          rollbackTriggered: boolean;
          rollbackApplied: boolean;
          shadowRestored: boolean;
          cutoverReadinessSkipped: boolean;
          stageDrillStageSignalsReported: boolean;
          stageDrillStageSignalsPassed: boolean;
        };
        failures: string[];
      };
      expect(payload.pass).toBe(true);
      expect(payload.checks.calibrationPass).toBe(true);
      expect(payload.checks.rollbackTriggered).toBe(true);
      expect(payload.checks.rollbackApplied).toBe(true);
      expect(payload.checks.shadowRestored).toBe(true);
      expect(payload.checks.cutoverReadinessSkipped).toBe(true);
      expect(payload.checks.stageDrillStageSignalsReported).toBe(true);
      expect(payload.checks.stageDrillStageSignalsPassed).toBe(true);
      expect(payload.failures).toEqual([]);
    });
  });

  it("fails when stage drill output omits rollback stage signal checks", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "supervised-rollback-simulation.json");

      await seedValidationSummaries(evidenceDir);
      await seedReadinessArtifacts(evidenceDir);
      await seedHorizonStatus(horizonPath);
      await seedEnvFile(envPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/run-supervised-rollback-simulation.mjs",
          "--stage",
          "majority",
          "--current-stage",
          "canary",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--majority-percent",
          "90",
          "--force-rollback-min-success-rate",
          "1.01",
          "--timeout-ms",
          "120000",
        ],
        {
          timeoutMs: 130_000,
          env: {
            ...process.env,
            UNIFIED_FORCE_MISSING_STAGE_DRILL_SIGNALS: "1",
          },
        },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: {
          stageDrillGoalPolicyPropagationReported: boolean;
          stageDrillGoalPolicyPropagationPassed: boolean;
        };
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.stageDrillGoalPolicyPropagationReported).toBe(false);
      expect(payload.checks.stageDrillGoalPolicyPropagationPassed).toBe(false);
      expect(payload.failures).toContain("stage_drill_goal_policy_propagation_not_reported");
    });
  });

  it("fails when latest stage-promotion readiness artifact is malformed", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "supervised-rollback-simulation.json");

      await seedValidationSummaries(evidenceDir);
      await seedReadinessArtifacts(evidenceDir);
      await seedHorizonStatus(horizonPath);
      await seedEnvFile(envPath);

      const malformedStagePromotionPath = path.join(
        evidenceDir,
        "stage-promotion-readiness-99999999999999.json",
      );
      await writeFile(
        malformedStagePromotionPath,
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
          "scripts/run-supervised-rollback-simulation.mjs",
          "--stage",
          "majority",
          "--current-stage",
          "canary",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--majority-percent",
          "90",
          "--force-rollback-min-success-rate",
          "1.01",
          "--timeout-ms",
          "120000",
          "--evidence-selection-mode",
          "latest",
        ],
        {
          timeoutMs: 130_000,
          env: {
            ...process.env,
            UNIFIED_FORCE_STAGE_PROMOTION_PAYLOAD_PATH: malformedStagePromotionPath,
          },
        },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: {
          stageDrillGoalPolicyPropagationReported: boolean;
          stageDrillGoalPolicyPropagationPassed: boolean;
        };
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.stageDrillGoalPolicyPropagationReported).toBe(true);
      expect(payload.checks.stageDrillGoalPolicyPropagationPassed).toBe(true);
      expect(payload.failures).toContain("stage_drill_child_schema_signals_not_passed");
    });
  });
});
