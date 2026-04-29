import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "h2-closeout-runner-test-"));
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
          goalPolicyFileValidation: null,
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
          releaseGoalPolicySourceConsistencyReported: true,
          releaseGoalPolicySourceConsistencyPassed: true,
          mergeBundleReleaseGoalPolicySourceConsistencyReported: true,
          mergeBundleReleaseGoalPolicySourceConsistencyPassed: true,
          bundleVerificationReleaseGoalPolicySourceConsistencyReported: true,
          bundleVerificationReleaseGoalPolicySourceConsistencyPassed: true,
          mergeBundleGoalPolicyValidationReported: true,
          mergeBundleGoalPolicyValidationPassed: true,
          mergeBundleInitialScopeGoalPolicyValidationReported: true,
          mergeBundleInitialScopeGoalPolicyValidationPassed: true,
          bundleVerificationGoalPolicyValidationReported: true,
          bundleVerificationGoalPolicyValidationPassed: true,
          bundleVerificationInitialScopeGoalPolicyValidationReported: true,
          bundleVerificationInitialScopeGoalPolicyValidationPassed: true,
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
}

async function seedHorizonStatus(
  statusPath: string,
  options?: { activeHorizon?: string; summary?: string },
): Promise<void> {
  const activeHorizon = options?.activeHorizon ?? "H2";
  const summary = options?.summary ?? "H2 closeout runner fixture";
  await writeFile(
    statusPath,
    JSON.stringify(
      {
        schemaVersion: "v1",
        updatedAtIso: new Date().toISOString(),
        owner: "cloud-agent",
        activeHorizon,
        activeStatus: "in_progress",
        summary,
        blockers: [],
        requiredEvidence: [
          {
            id: "h1-evidence-summary",
            command: "npm run validate:evidence-summary",
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
            id: "h2-drill-suite",
            command: "npm run run:h2-drill-suite",
            artifactPattern: "evidence/h2-drill-suite-*.json",
            required: true,
            horizon: "H2",
          },
          {
            id: "h2-rollback-threshold-calibration",
            command: "npm run calibrate:rollback-thresholds",
            artifactPattern: "evidence/rollback-threshold-calibration-majority-*.json",
            required: true,
            horizon: "H2",
          },
          {
            id: "h2-supervised-rollback-simulation",
            command: "npm run run:supervised-rollback-simulation",
            artifactPattern: "evidence/supervised-rollback-simulation-*.json",
            required: true,
            horizon: "H2",
          },
        ],
        nextActions: [
          {
            id: "h2-action-1",
            summary: "seed closeout action",
            targetHorizon: "H2",
            status: "completed",
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

async function seedH2DrillSuiteEvidence(evidenceDir: string): Promise<void> {
  await writeFile(
    path.join(evidenceDir, "h2-drill-suite-20260426-000000.json"),
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        pass: true,
        checks: {
          canaryHoldPass: true,
          majorityHoldPass: true,
          rollbackSimulationTriggered: true,
          rollbackSimulationPass: true,
          rollbackPolicySourceConsistencySignalsReported: true,
          rollbackPolicySourceConsistencySignalsPass: true,
        },
      },
      null,
      2,
    ),
    "utf8",
  );
}

describe("run-h2-closeout.mjs", () => {
  it("executes H2 closeout pipeline and writes passing manifest", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-closeout-runner.json");

      await seedValidationSummaries(evidenceDir);
      await seedReadinessArtifacts(evidenceDir);
      await seedH2DrillSuiteEvidence(evidenceDir);
      await seedHorizonStatus(horizonPath);
      await seedEnvFile(envPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/run-h2-closeout.mjs",
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
        ],
        { timeoutMs: 180_000 },
      );
      if (result.code !== 0) {
        throw new Error(`run-h2-closeout failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
      }
      expect(result.code).toBe(0);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: {
          calibrationPass: boolean;
          supervisedSimulationPass: boolean;
          supervisedSimulationStageGoalPolicyPropagationPassed: boolean;
          horizonCloseoutGatePass: boolean;
          h2CloseoutGatePass: boolean;
        };
        failures: string[];
      };
      expect(payload.pass).toBe(true);
      expect(payload.checks.calibrationPass).toBe(true);
      expect(payload.checks.supervisedSimulationPass).toBe(true);
      expect(payload.checks.supervisedSimulationStageGoalPolicyPropagationPassed).toBe(true);
      expect(payload.checks.horizonCloseoutGatePass).toBe(true);
      expect(payload.checks.h2CloseoutGatePass).toBe(true);
      expect(payload.failures).toEqual([]);
    });
  });

  it("fails when supervised simulation omits drill stage policy propagation checks", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-closeout-runner.json");

      await seedValidationSummaries(evidenceDir);
      await seedReadinessArtifacts(evidenceDir);
      await seedH2DrillSuiteEvidence(evidenceDir);
      await seedHorizonStatus(horizonPath);
      await seedEnvFile(envPath);

      const simulationPath = path.join(
        evidenceDir,
        "supervised-rollback-simulation-20260426-999999.json",
      );
      await writeFile(
        simulationPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            checks: {
              calibrationPass: true,
              stageDrillEvaluated: true,
              rollbackTriggered: true,
              rollbackApplied: true,
              cutoverReadinessSkipped: true,
              cutoverReadinessPass: null,
              shadowRestored: true,
              stageDrillGoalPolicyPropagationReported: false,
              stageDrillGoalPolicyPropagationPassed: false,
          stageDrillGoalPolicySourceConsistencyPropagationReported: true,
          stageDrillGoalPolicySourceConsistencyPropagationPassed: true,
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
          "scripts/run-h2-closeout.mjs",
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
          "--simulation-out",
          simulationPath,
        ],
        {
          timeoutMs: 180_000,
          env: {
            ...process.env,
            UNIFIED_FORCE_MISSING_STAGE_DRILL_SIGNALS: "1",
          },
        },
      );
      expect(result.code).toBe(2);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: {
          supervisedSimulationStageGoalPolicyPropagationPassed: boolean;
        };
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.supervisedSimulationStageGoalPolicyPropagationPassed).toBe(false);
      expect(payload.failures).toContain("supervised_simulation_stage_goal_policy_propagation_not_reported");
    });
  });

  it("fails when required prerequisite evidence is missing", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-closeout-runner.json");

      await seedValidationSummaries(evidenceDir);
      await seedReadinessArtifacts(evidenceDir);
      await seedHorizonStatus(horizonPath);
      await seedEnvFile(envPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/run-h2-closeout.mjs",
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
        ],
        { timeoutMs: 180_000 },
      );
      expect(result.code).toBe(2);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.failures).toContain("horizon_closeout_gate_failed");
      expect(payload.failures).toContain("h2_closeout_gate_failed");
    });
  });

  it("dual-reports h2 closeout gate failure alias for H3 source horizon", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h3-closeout-runner.json");

      await seedValidationSummaries(evidenceDir);
      await seedReadinessArtifacts(evidenceDir);
      await seedHorizonStatus(horizonPath, { activeHorizon: "H3", summary: "H3 closeout runner fixture" });
      await seedEnvFile(envPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/run-h2-closeout.mjs",
          "--horizon",
          "H3",
          "--next-horizon",
          "H4",
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
        ],
        { timeoutMs: 180_000 },
      );
      expect(result.code).toBe(2);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.failures).toContain("horizon_closeout_gate_failed");
      expect(payload.failures).toContain("h2_closeout_gate_failed");
    });
  });
});
