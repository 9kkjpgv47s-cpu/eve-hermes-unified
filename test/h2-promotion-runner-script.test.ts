import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "h2-promotion-runner-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function seedValidationSummaries(evidenceDir: string): Promise<void> {
  await mkdir(evidenceDir, { recursive: true });
  const entries = [
    { stamp: "20260426-000000", successRate: 0.9995, p95LatencyMs: 500 },
    { stamp: "20260426-000001", successRate: 0.9992, p95LatencyMs: 520 },
    { stamp: "20260426-000002", successRate: 0.9996, p95LatencyMs: 510 },
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
            passed: true,
            failures: [],
          },
        },
        null,
        2,
      ),
      "utf8",
    );
  }
}

async function seedSharedEvidence(evidenceDir: string): Promise<void> {
  await seedValidationSummaries(evidenceDir);
  const stamp = "20260426-000000";
  await writeFile(
    path.join(evidenceDir, `release-readiness-${stamp}.json`),
    JSON.stringify(
      {
        readinessVersion: "v1",
        generatedAtIso: new Date().toISOString(),
        defaultValidationCommand: "validate:all",
        pass: true,
        files: {
          validationSummary: path.join(evidenceDir, "validation-summary-20260426-000002.json"),
          regression: null,
          cutoverReadiness: path.join(evidenceDir, `cutover-readiness-${stamp}.json`),
          failureInjection: null,
          soak: null,
          goalPolicyFileValidation: path.join(
            evidenceDir,
            `goal-policy-file-validation-${stamp}.json`,
          ),
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
    path.join(evidenceDir, `goal-policy-file-validation-${stamp}.json`),
    JSON.stringify({ pass: true, failures: [] }, null, 2),
    "utf8",
  );
  await writeFile(
    path.join(evidenceDir, `cutover-readiness-${stamp}.json`),
    JSON.stringify({ generatedAtIso: new Date().toISOString(), pass: true }, null, 2),
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
        checks: {
          validationSummaryPassed: true,
          cutoverReadinessPassed: true,
          releaseReadinessPassed: true,
          releaseGoalPolicyValidationReported: true,
          releaseGoalPolicyValidationPassed: true,
          releaseGoalPolicySourceConsistencyReported: true,
          releaseGoalPolicySourceConsistencyPassed: true,
          mergeBundleReleaseGoalPolicyValidationReported: true,
          mergeBundleReleaseGoalPolicyValidationPassed: true,
          mergeBundleGoalPolicyValidationReported: true,
          mergeBundleGoalPolicyValidationPassed: true,
          mergeBundleReleaseGoalPolicySourceConsistencyReported: true,
          mergeBundleReleaseGoalPolicySourceConsistencyPassed: true,
          mergeBundleGoalPolicySourceConsistencyReported: true,
          mergeBundleGoalPolicySourceConsistencyPassed: true,
          mergeBundleInitialScopeGoalPolicyValidationReported: true,
          mergeBundleInitialScopeGoalPolicyValidationPassed: true,
          bundleVerificationReleaseGoalPolicyValidationReported: true,
          bundleVerificationReleaseGoalPolicyValidationPassed: true,
          bundleVerificationGoalPolicyValidationReported: true,
          bundleVerificationGoalPolicyValidationPassed: true,
          bundleVerificationReleaseGoalPolicySourceConsistencyReported: true,
          bundleVerificationReleaseGoalPolicySourceConsistencyPassed: true,
          bundleVerificationGoalPolicySourceConsistencyReported: true,
          bundleVerificationGoalPolicySourceConsistencyPassed: true,
          bundleVerificationInitialScopeGoalPolicyValidationReported: true,
          bundleVerificationInitialScopeGoalPolicyValidationPassed: true,
          bundleVerificationSelectionSignalReported: true,
          bundleVerificationSelectionProofPassed: true,
          bundleVerificationValidationManifestPathReported: true,
          bundleVerificationSelectionGateSatisfied: true,
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
    path.join(evidenceDir, `h2-drill-suite-${stamp}.json`),
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

async function seedHorizonStatus(statusPath: string): Promise<void> {
  await writeFile(
    statusPath,
    JSON.stringify(
      {
        schemaVersion: "v1",
        updatedAtIso: "2026-04-26T21:40:00Z",
        owner: "cloud-agent",
        activeHorizon: "H2",
        activeStatus: "in_progress",
        summary: "H2 active for promotion runner test",
        blockers: [],
        requiredEvidence: [
          {
            id: "h1-release-readiness",
            command: "npm run validate:release-readiness",
            artifactPattern: "evidence/release-readiness-*.json",
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
            id: "h1-cutover-readiness",
            command: "npm run validate:cutover-readiness",
            artifactPattern: "evidence/cutover-readiness-*.json",
            required: true,
          },
          {
            id: "h1-evidence-summary",
            command: "npm run validate:evidence-summary",
            artifactPattern: "evidence/validation-summary-*.json",
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
            summary: "seed action",
            targetHorizon: "H2",
            status: "completed",
          },
          {
            id: "h2-action-2",
            summary: "secondary seed action",
            targetHorizon: "H2",
            status: "completed",
          },
          {
            id: "h3-action-1",
            summary: "h3 seed action one",
            targetHorizon: "H3",
            status: "planned",
            tags: ["capability"],
          },
          {
            id: "h3-action-2",
            summary: "h3 seed action two",
            targetHorizon: "H3",
            status: "planned",
            tags: ["durability"],
          },
          {
            id: "h3-action-3",
            summary: "h3 seed action three",
            targetHorizon: "H3",
            status: "planned",
            tags: ["policy-hardening"],
          },
        ],
        goalPolicies: {
          transitions: {
            "H2->H3": {
              minimumGoalIncrease: 1,
              minActionGrowthFactor: 1.1,
              minPendingNextActions: 2,
              requiredTaggedActionCounts: {
                capability: 1,
                durability: {
                  minCount: 1,
                  minPendingCount: 1,
                },
              },
            },
          },
        },
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
          H32: { status: "planned", summary: "H32 planned" },
          H33: { status: "planned", summary: "H33 planned" },
          H34: { status: "planned", summary: "H34 planned" },
          H35: { status: "planned", summary: "H35 planned" },
        },
        history: [
          {
            timestamp: "2026-04-26T21:40:00Z",
            horizon: "H2",
            status: "in_progress",
            note: "seed H2 active",
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

async function seedCloseoutArtifact(
  evidenceDir: string,
  options?: { pass?: boolean; horizon?: string; nextHorizon?: string },
): Promise<string> {
  const closeoutPath = path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json");
  await writeFile(
    closeoutPath,
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        pass: options?.pass ?? true,
        closeout: {
          horizon: options?.horizon ?? "H2",
          nextHorizon: options?.nextHorizon ?? "H3",
          canCloseHorizon: options?.pass ?? true,
          canStartNextHorizon: false,
        },
        checks: {
          horizonValidationPass: true,
          nextHorizon: {
            selectedNextHorizon: options?.nextHorizon ?? "H3",
          },
        },
        failures: options?.pass === false ? ["synthetic_closeout_failure"] : [],
      },
      null,
      2,
    ),
    "utf8",
  );
  return closeoutPath;
}

async function seedGoalPolicyFile(goalPolicyPath: string): Promise<void> {
  await writeFile(
    goalPolicyPath,
    JSON.stringify(
      {
        schemaVersion: "v1",
        updatedAtIso: new Date().toISOString(),
        transitions: {
          "H2->H3": {
            minimumGoalIncrease: 1,
            minActionGrowthFactor: 1.1,
            minPendingNextActions: 2,
            requiredTaggedActionCounts: {
              capability: 1,
              durability: {
                minCount: 1,
                minPendingCount: 1,
              },
            },
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function seedMismatchedHorizonGoalPolicies(statusPath: string): Promise<void> {
  const payload = JSON.parse(await readFile(statusPath, "utf8")) as {
    goalPolicies?: { transitions?: Record<string, unknown> };
  };
  if (!payload.goalPolicies || typeof payload.goalPolicies !== "object") {
    payload.goalPolicies = { transitions: {} };
  }
  if (
    !payload.goalPolicies.transitions ||
    typeof payload.goalPolicies.transitions !== "object"
  ) {
    payload.goalPolicies.transitions = {};
  }
  payload.goalPolicies.transitions["H2->H3"] = {
    minimumGoalIncrease: 4,
    minActionGrowthFactor: 2,
    minPendingNextActions: 4,
    requiredTaggedActionCounts: {
      conflict: { minCount: 3, minPendingCount: 2 },
    },
  };
  await writeFile(statusPath, JSON.stringify(payload, null, 2), "utf8");
}

async function seedGoalPolicyFileWithDuplicateTransition(goalPolicyPath: string): Promise<void> {
  await writeFile(
    goalPolicyPath,
    `{
  "schemaVersion": "v1",
  "updatedAtIso": "${new Date().toISOString()}",
  "transitions": {
    "H2->H3": {
      "minimumGoalIncrease": 1,
      "minActionGrowthFactor": 1.1,
      "minPendingNextActions": 2,
      "requiredTaggedActionCounts": {
        "capability": 1
      }
    },
    "H2->H3": {
      "minimumGoalIncrease": 2,
      "minActionGrowthFactor": 1.3,
      "minPendingNextActions": 3,
      "requiredTaggedActionCounts": {
        "durability": 1
      }
    }
  }
}
`,
    "utf8",
  );
}

async function seedMismatchedGoalPolicyFile(goalPolicyPath: string): Promise<void> {
  await writeFile(
    goalPolicyPath,
    JSON.stringify(
      {
        schemaVersion: "v1",
        transitions: {
          "H2->H3": {
            minimumGoalIncrease: 2,
            minActionGrowthFactor: 1.3,
            minPendingNextActions: 3,
            requiredTaggedActionCounts: {
              conflict: 2,
            },
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function seedDefaultGoalPolicyFileForStatus(statusPath: string): Promise<string> {
  const defaultGoalPolicyPath = path.join(path.dirname(statusPath), "GOAL_POLICIES.json");
  await seedGoalPolicyFile(defaultGoalPolicyPath);
  return defaultGoalPolicyPath;
}

describe("run-h2-promotion.mjs", () => {
  it("passes progressive gate with goal policy key and tagged actions", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-promotion-policy.json");

      await seedSharedEvidence(evidenceDir);
      await seedHorizonStatus(statusPath);
      await seedEnvFile(envPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/run-h2-promotion.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          statusPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--require-progressive-goals",
          "--require-goal-policy-coverage",
          "--required-policy-transitions",
          "H2->H3",
          "--require-policy-tagged-targets",
          "--goal-policy-key",
          "H2->H3",
        ],
        { timeoutMs: 180_000 },
      );
      expect(result.code).toBe(0);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: {
          progressiveGoalsPass: boolean;
          goalPolicyKey: string | null;
          goalPolicyCoveragePass: boolean;
        };
      };
      expect(payload.pass).toBe(true);
      expect(payload.checks.progressiveGoalsPass).toBe(true);
      expect(payload.checks.goalPolicyKey).toBe("H2->H3");
      expect(payload.checks.goalPolicyCoveragePass).toBe(true);
    });
  });

  it("passes when readiness audit gate is required", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-promotion-readiness-audit.json");

      await seedSharedEvidence(evidenceDir);
      await seedHorizonStatus(statusPath);
      await seedEnvFile(envPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/run-h2-promotion.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          statusPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--require-progressive-goals",
          "--goal-policy-key",
          "H2->H3",
          "--require-goal-policy-coverage",
          "--required-policy-transitions",
          "H2->H3",
          "--require-policy-tagged-targets",
          "--require-goal-policy-readiness-audit",
          "--goal-policy-readiness-audit-until-horizon",
          "H3",
          "--require-goal-policy-readiness-tagged-targets",
          "--require-goal-policy-readiness-positive-pending-min",
        ],
        { timeoutMs: 180_000 },
      );
      if (result.code !== 0) {
        throw new Error(
          `run-h2-promotion generalized flow failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
        );
      }
      expect(result.code).toBe(0);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: { goalPolicyReadinessAuditPass: boolean };
      };
      expect(payload.pass).toBe(true);
      expect(payload.checks.goalPolicyReadinessAuditPass).toBe(true);
    });
  });

  it("enforces strict goal policy mode with single transition defaults", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-promotion-strict-mode.json");

      await seedSharedEvidence(evidenceDir);
      await seedHorizonStatus(statusPath);
      await seedEnvFile(envPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/run-h2-promotion.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          statusPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--strict-goal-policy-gates",
          "--goal-policy-key",
          "H2->H3",
        ],
        { timeoutMs: 180_000 },
      );
      if (result.code !== 0) {
        throw new Error(
          `run-h2-promotion H3->H4 expected success\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
        );
      }
      expect(result.code).toBe(0);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: {
          strictGoalPolicyGates: boolean;
          requireProgressiveGoals: boolean;
          progressiveGoalsPass: boolean;
          requireGoalPolicyCoverage: boolean;
          goalPolicyCoveragePass: boolean;
          requireGoalPolicyReadinessAudit: boolean;
          goalPolicyReadinessAuditPass: boolean;
        };
      };
      expect(payload.pass).toBe(true);
      expect(payload.checks.strictGoalPolicyGates).toBe(true);
      expect(payload.checks.requireProgressiveGoals).toBe(true);
      expect(payload.checks.progressiveGoalsPass).toBe(true);
      expect(payload.checks.requireGoalPolicyCoverage).toBe(true);
      expect(payload.checks.goalPolicyCoveragePass).toBe(true);
      expect(payload.checks.requireGoalPolicyReadinessAudit).toBe(true);
      expect(payload.checks.goalPolicyReadinessAuditPass).toBe(true);
    });
  });

  it("runs closeout + promotion and advances active horizon", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-promotion-runner.json");

      await seedSharedEvidence(evidenceDir);
      await seedHorizonStatus(statusPath);
      await seedEnvFile(envPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/run-h2-promotion.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          statusPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--require-progressive-goals",
          "--require-goal-policy-coverage",
          "--required-policy-transitions",
          "H2->H3",
          "--require-policy-tagged-targets",
          "--require-goal-policy-readiness-audit",
          "--goal-policy-readiness-audit-until-horizon",
          "H3",
          "--require-goal-policy-readiness-tagged-targets",
          "--require-goal-policy-readiness-positive-pending-min",
          "--goal-policy-key",
          "H2->H3",
        ],
        { timeoutMs: 180_000 },
      );
      if (result.code !== 0) {
        throw new Error(
          `run-h2-promotion expected success, got ${String(result.code)}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
        );
      }
      expect(result.code).toBe(0);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: {
          closeoutRunPass: boolean;
          horizonPromotionPass: boolean;
          horizonAdvanced: boolean;
          progressiveGoalsPass: boolean;
          goalPolicyCoveragePass: boolean;
          goalPolicyReadinessAuditPass: boolean;
        };
        failures: string[];
      };
      expect(payload.pass).toBe(true);
      expect(payload.checks.closeoutRunPass).toBe(true);
      expect(payload.checks.horizonPromotionPass).toBe(true);
      expect(payload.checks.horizonAdvanced).toBe(true);
      expect(payload.checks.progressiveGoalsPass).toBe(true);
      expect(payload.checks.goalPolicyCoveragePass).toBe(true);
      expect(payload.checks.goalPolicyReadinessAuditPass).toBe(true);
      expect(payload.failures).toEqual([]);

      const statusPayload = JSON.parse(await readFile(statusPath, "utf8")) as {
        activeHorizon: string;
        activeStatus: string;
        horizonStates: Record<string, { status: string }>;
      };
      expect(statusPayload.activeHorizon).toBe("H3");
      expect(statusPayload.activeStatus).toBe("in_progress");
      expect(statusPayload.horizonStates.H2.status).toBe("completed");
      expect(statusPayload.horizonStates.H3.status).toBe("in_progress");
    });
  });

  it("fails when closeout phase fails and does not mutate horizon status", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-promotion-runner.json");

      await seedSharedEvidence(evidenceDir);
      await seedHorizonStatus(statusPath);
      await seedEnvFile(envPath);
      await rm(path.join(evidenceDir, "h2-drill-suite-20260426-000000.json"), { force: true });

      const before = await readFile(statusPath, "utf8");
      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/run-h2-promotion.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          statusPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--require-progressive-goals",
          "--require-goal-policy-coverage",
          "--required-policy-transitions",
          "H2->H3",
          "--require-policy-tagged-targets",
        ],
        { timeoutMs: 180_000 },
      );
      expect(result.code).toBe(2);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.failures).toContain("h2_closeout_run_failed");

      const after = await readFile(statusPath, "utf8");
      expect(after).toBe(before);
    });
  });

  it("passes strict mode using external goal-policy file", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-promotion-goal-policy-file.json");
      const goalPolicyPath = path.join(dir, "GOAL_POLICY.json");

      await seedSharedEvidence(evidenceDir);
      await seedHorizonStatus(statusPath);
      await seedEnvFile(envPath);
      await seedGoalPolicyFile(goalPolicyPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/run-h2-promotion.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          statusPath,
          "--env-file",
          envPath,
          "--goal-policy-file",
          goalPolicyPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--strict-goal-policy-gates",
          "--goal-policy-key",
          "H2->H3",
        ],
        { timeoutMs: 180_000 },
      );
      expect(result.code).toBe(0);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: {
          strictGoalPolicyGates: boolean;
          goalPolicyFile: string | null;
          progressiveGoalsPass: boolean;
          goalPolicyCoveragePass: boolean;
          goalPolicyReadinessAuditPass: boolean;
        };
      };
      expect(payload.pass).toBe(true);
      expect(payload.checks.strictGoalPolicyGates).toBe(true);
      expect(payload.checks.goalPolicyFile).toBe(goalPolicyPath);
      expect(payload.checks.progressiveGoalsPass).toBe(true);
      expect(payload.checks.goalPolicyCoveragePass).toBe(true);
      expect(payload.checks.goalPolicyReadinessAuditPass).toBe(true);
    });
  });

  it("supports generalized H3 to H4 dry-run promotion orchestration", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h3-promotion-runner.json");

      await seedSharedEvidence(evidenceDir);
      await seedHorizonStatus(statusPath);
      await seedEnvFile(envPath);

      const statusPayload = JSON.parse(await readFile(statusPath, "utf8")) as {
        activeHorizon: string;
        activeStatus: string;
        horizonStates: Record<string, { status: string; summary: string }>;
        nextActions: Array<{
          id: string;
          summary: string;
          targetHorizon: string;
          status: string;
          tags?: string[];
        }>;
        goalPolicies?: {
          transitions?: Record<string, unknown>;
        };
      };
      statusPayload.activeHorizon = "H3";
      statusPayload.activeStatus = "in_progress";
      if (statusPayload.horizonStates && typeof statusPayload.horizonStates === "object") {
        statusPayload.horizonStates.H2 = {
          status: "completed",
          summary: "H2 complete",
        };
        statusPayload.horizonStates.H3 = {
          status: "in_progress",
          summary: "H3 active",
        };
        statusPayload.horizonStates.H4 = {
          status: "planned",
          summary: "H4 planned",
        };
      }
      statusPayload.nextActions = [
        {
          id: "h3-action-1",
          summary: "h3 completion action",
          targetHorizon: "H3",
          status: "completed",
          tags: ["durability"],
        },
        {
          id: "h3-action-2",
          summary: "h3 secondary completion action",
          targetHorizon: "H3",
          status: "completed",
          tags: ["policy-hardening"],
        },
        {
          id: "h4-action-1",
          summary: "h4 next action one",
          targetHorizon: "H4",
          status: "planned",
          tags: ["memory"],
        },
        {
          id: "h4-action-2",
          summary: "h4 next action two",
          targetHorizon: "H4",
          status: "planned",
          tags: ["capability"],
        },
        {
          id: "h4-action-3",
          summary: "h4 next action three",
          targetHorizon: "H4",
          status: "planned",
          tags: ["durability"],
        },
      ];
      if (!statusPayload.goalPolicies || typeof statusPayload.goalPolicies !== "object") {
        statusPayload.goalPolicies = { transitions: {} };
      }
      if (
        !statusPayload.goalPolicies.transitions ||
        typeof statusPayload.goalPolicies.transitions !== "object"
      ) {
        statusPayload.goalPolicies.transitions = {};
      }
      statusPayload.goalPolicies.transitions["H3->H4"] = {
        minimumGoalIncrease: 1,
        minActionGrowthFactor: 1.1,
        minPendingNextActions: 2,
        requiredTaggedActionCounts: {
          memory: { minCount: 1, minPendingCount: 1 },
          capability: { minCount: 1, minPendingCount: 1 },
        },
      };
      await writeFile(statusPath, JSON.stringify(statusPayload, null, 2), "utf8");

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/run-h2-promotion.mjs",
          "--horizon",
          "H3",
          "--next-horizon",
          "H4",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          statusPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--dry-run",
          "--require-progressive-goals",
          "--goal-policy-key",
          "H3->H4",
        ],
        { timeoutMs: 180_000 },
      );
      expect(result.code).toBe(0);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        horizon: { source: string; next: string };
        checks: {
          sourceHorizon: string;
          nextHorizon: string;
          closeoutGatePass: boolean;
          horizonPromotionPass: boolean;
        };
        failures: string[];
      };
      expect(payload.pass).toBe(true);
      expect(payload.horizon.source).toBe("H3");
      expect(payload.horizon.next).toBe("H4");
      expect(payload.checks.sourceHorizon).toBe("H3");
      expect(payload.checks.nextHorizon).toBe("H4");
      expect(payload.checks.closeoutGatePass).toBe(true);
      expect(payload.checks.horizonPromotionPass).toBe(true);
      expect(payload.failures).toEqual([]);
    });
  });

  it("fails when closeout run omits supervised simulation stage goal-policy propagation", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-promotion-missing-supervised-stage-policy.json");

      await seedSharedEvidence(evidenceDir);
      await seedHorizonStatus(statusPath);
      await seedEnvFile(envPath);
      await writeFile(
        path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            closeout: {
              horizon: "H2",
              nextHorizon: "H3",
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const closeoutRunPath = path.join(evidenceDir, "h2-closeout-run-99999999999999.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            horizon: {
              source: "H2",
              next: "H3",
            },
            files: {
              closeoutOut: path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
            },
            checks: {
              h2CloseoutGatePass: true,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: false,
              supervisedSimulationStageGoalPolicyPropagationPassed: false,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: false,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: false,
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
          "scripts/run-h2-promotion.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          statusPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--closeout-run-out",
          closeoutRunPath,
        ],
        {
          timeoutMs: 180_000,
          env: {
            UNIFIED_FORCE_MISSING_STAGE_DRILL_SIGNALS: "1",
          },
        },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: {
          closeoutRunSupervisedSimulationStageGoalPolicyPropagationReported: boolean | null;
          closeoutRunSupervisedSimulationStageGoalPolicyPropagationPassed: boolean | null;
        };
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.closeoutRunSupervisedSimulationStageGoalPolicyPropagationReported).toBe(
        false,
      );
      expect(payload.checks.closeoutRunSupervisedSimulationStageGoalPolicyPropagationPassed).toBe(
        false,
      );
      expect(payload.failures).toContain("h2_closeout_run_missing_supervised_stage_goal_policy");
      expect(payload.failures).not.toContain("horizon_promotion_failed");
    });
  });

  it("fails when closeout run does not pass h2 closeout gate", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-promotion-missing-closeout-gate.json");

      await seedSharedEvidence(evidenceDir);
      await seedHorizonStatus(statusPath);
      await seedEnvFile(envPath);
      await writeFile(
        path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            closeout: {
              horizon: "H2",
              nextHorizon: "H3",
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const closeoutRunPath = path.join(evidenceDir, "h2-closeout-run-88888888888888.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            horizon: {
              source: "H2",
              next: "H3",
            },
            files: {
              closeoutOut: path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
            },
            checks: {
              h2CloseoutGatePass: false,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: true,
              supervisedSimulationStageGoalPolicyPropagationPassed: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
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
          "scripts/run-h2-promotion.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          statusPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--closeout-run-out",
          closeoutRunPath,
        ],
        { timeoutMs: 180_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: {
          closeoutRunPass: boolean;
          closeoutGatePass: boolean;
          closeoutRunH2CloseoutGateReported: boolean;
        };
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.closeoutRunPass).toBe(true);
      expect(payload.checks.closeoutGatePass).toBe(false);
      expect(payload.checks.closeoutRunH2CloseoutGateReported).toBe(true);
      expect(payload.failures).toContain("h2_closeout_run_gate_not_passed");
      expect(payload.failures).not.toContain("horizon_promotion_failed");
    });
  });

  it("fails when closeout run does not report h2 closeout gate signal", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-promotion-missing-closeout-gate-reported.json");

      await seedSharedEvidence(evidenceDir);
      await seedHorizonStatus(statusPath);
      await seedEnvFile(envPath);
      await writeFile(
        path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            closeout: {
              horizon: "H2",
              nextHorizon: "H3",
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const closeoutRunPath = path.join(evidenceDir, "h2-closeout-run-88888888888887.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            horizon: {
              source: "H2",
              next: "H3",
            },
            files: {
              closeoutOut: path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
            },
            checks: {
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: true,
              supervisedSimulationStageGoalPolicyPropagationPassed: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
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
          "scripts/run-h2-promotion.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          statusPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--closeout-run-out",
          closeoutRunPath,
        ],
        { timeoutMs: 180_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: {
          closeoutRunH2CloseoutGateReported: boolean;
          closeoutRunH2CloseoutGatePass: boolean;
        };
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.closeoutRunH2CloseoutGateReported).toBe(false);
      expect(payload.checks.closeoutRunH2CloseoutGatePass).toBe(false);
      expect(payload.failures).toContain("h2_closeout_run_gate_not_reported");
      expect(payload.failures).not.toContain("h2_closeout_run_gate_not_passed");
      expect(payload.failures).not.toContain("horizon_promotion_failed");
    });
  });

  it("fails when closeout run horizon metadata mismatches requested transition", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-promotion-mismatched-closeout-run-horizon.json");

      await seedSharedEvidence(evidenceDir);
      await seedHorizonStatus(statusPath);
      await seedEnvFile(envPath);
      await writeFile(
        path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            closeout: {
              horizon: "H2",
              nextHorizon: "H3",
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const closeoutRunPath = path.join(evidenceDir, "h2-closeout-run-99999999999997.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            horizon: {
              source: "H2",
              next: "H4",
            },
            checks: {
              h2CloseoutGatePass: true,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: true,
              supervisedSimulationStageGoalPolicyPropagationPassed: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
            },
            files: {
              closeoutOut: path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
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
          "scripts/run-h2-promotion.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          statusPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--closeout-run-out",
          closeoutRunPath,
        ],
        { timeoutMs: 180_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: {
          closeoutRunHorizonSourceMatches: boolean | null;
          closeoutRunHorizonNextMatches: boolean | null;
        };
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.closeoutRunHorizonSourceMatches).toBe(true);
      expect(payload.checks.closeoutRunHorizonNextMatches).toBe(false);
      expect(payload.failures).toContain("h2_closeout_run_horizon_next_mismatch");
      expect(payload.failures).not.toContain("horizon_promotion_failed");
    });
  });

  it("fails when closeout run reports conflicting source horizon aliases via checks", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-promotion-conflicting-closeout-run-source-aliases.json");

      await seedSharedEvidence(evidenceDir);
      await seedHorizonStatus(statusPath);
      await seedEnvFile(envPath);
      await writeFile(
        path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            closeout: {
              horizon: "H2",
              nextHorizon: "H3",
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const closeoutRunPath = path.join(evidenceDir, "h2-closeout-run-99999999999993.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            horizon: {
              source: "H2",
              next: "H3",
            },
            checks: {
              sourceHorizon: "H4",
              h2CloseoutGatePass: true,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: true,
              supervisedSimulationStageGoalPolicyPropagationPassed: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
            },
            files: {
              closeoutOut: path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
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
          "scripts/run-h2-promotion.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          statusPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--closeout-run-out",
          closeoutRunPath,
        ],
        { timeoutMs: 180_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: {
          closeoutRunHorizonSourceAliasConflict: boolean;
        };
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.closeoutRunHorizonSourceAliasConflict).toBe(true);
      expect(payload.failures).toContain("h2_closeout_run_horizon_source_alias_conflict");
      expect(payload.failures).not.toContain("horizon_promotion_failed");
    });
  });

  it("fails when closeout run reports conflicting source horizon aliases via top-level sourceHorizon", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-promotion-closeout-run-source-alias-conflict.json");

      await seedSharedEvidence(evidenceDir);
      await seedHorizonStatus(statusPath);
      await seedEnvFile(envPath);
      await writeFile(
        path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            closeout: {
              horizon: "H2",
              nextHorizon: "H3",
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const closeoutRunPath = path.join(evidenceDir, "h2-closeout-run-99999999999993.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            horizon: {
              source: "H2",
              next: "H3",
            },
            sourceHorizon: "H4",
            checks: {
              h2CloseoutGatePass: true,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: true,
              supervisedSimulationStageGoalPolicyPropagationPassed: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
            },
            files: {
              closeoutOut: path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
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
          "scripts/run-h2-promotion.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          statusPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--closeout-run-out",
          closeoutRunPath,
        ],
        { timeoutMs: 180_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: {
          closeoutRunHorizonSourceAliasConflict: boolean;
          closeoutRunHorizonSourceReported: boolean;
          closeoutRunHorizonSourceMatches: boolean | null;
        };
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.closeoutRunHorizonSourceAliasConflict).toBe(true);
      expect(payload.checks.closeoutRunHorizonSourceReported).toBe(true);
      expect(payload.checks.closeoutRunHorizonSourceMatches).toBe(true);
      expect(payload.failures).toContain("h2_closeout_run_horizon_source_alias_conflict");
      expect(payload.failures).not.toContain("horizon_promotion_failed");
    });
  });

  it("fails when closeout artifact reports conflicting next horizon aliases", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-promotion-closeout-artifact-next-alias-conflict.json");

      await seedSharedEvidence(evidenceDir);
      await seedHorizonStatus(statusPath);
      await seedEnvFile(envPath);
      await writeFile(
        path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            closeout: {
              horizon: "H2",
              nextHorizon: "H3",
              targetNextHorizon: "H4",
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const closeoutRunPath = path.join(evidenceDir, "h2-closeout-run-99999999999992.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            horizon: {
              source: "H2",
              next: "H3",
            },
            checks: {
              h2CloseoutGatePass: true,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: true,
              supervisedSimulationStageGoalPolicyPropagationPassed: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
            },
            files: {
              closeoutOut: path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
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
          "scripts/run-h2-promotion.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          statusPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--closeout-run-out",
          closeoutRunPath,
        ],
        { timeoutMs: 180_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: {
          closeoutRunCloseoutArtifactHorizonNextAliasConflict: boolean;
          closeoutRunCloseoutArtifactHorizonNextMatches: boolean | null;
        };
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.closeoutRunCloseoutArtifactHorizonNextAliasConflict).toBe(true);
      expect(payload.checks.closeoutRunCloseoutArtifactHorizonNextMatches).toBe(true);
      expect(payload.failures).toContain("h2_closeout_run_closeout_artifact_horizon_next_alias_conflict");
      expect(payload.failures).not.toContain("horizon_promotion_failed");
    });
  });

  it("fails when closeout run reports invalid next horizon token", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-promotion-closeout-run-invalid-next.json");

      await seedSharedEvidence(evidenceDir);
      await seedHorizonStatus(statusPath);
      await seedEnvFile(envPath);
      await writeFile(
        path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            closeout: {
              horizon: "H2",
              nextHorizon: "H3",
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const closeoutRunPath = path.join(evidenceDir, "h2-closeout-run-99999999999991.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            horizon: {
              source: "H2",
              next: "H3",
            },
            checks: {
              nextHorizon: "NOT_A_HORIZON",
              h2CloseoutGatePass: true,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: true,
              supervisedSimulationStageGoalPolicyPropagationPassed: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
            },
            files: {
              closeoutOut: path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
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
          "scripts/run-h2-promotion.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          statusPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--closeout-run-out",
          closeoutRunPath,
        ],
        { timeoutMs: 180_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: {
          closeoutRunHorizonNextInvalid: boolean;
          closeoutRunHorizonNextInvalidValues: string[] | null;
          closeoutRunHorizonNextAliasConflict: boolean;
          closeoutRunHorizonNextMatches: boolean | null;
        };
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.closeoutRunHorizonNextInvalid).toBe(true);
      expect(payload.checks.closeoutRunHorizonNextInvalidValues).toContain("NOT_A_HORIZON");
      expect(payload.checks.closeoutRunHorizonNextAliasConflict).toBe(false);
      expect(payload.checks.closeoutRunHorizonNextMatches).toBe(true);
      expect(payload.failures).toContain("h2_closeout_run_horizon_next_invalid");
      expect(payload.failures).not.toContain("horizon_promotion_failed");
    });
  });

  it("fails when closeout run reports invalid source horizon token", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-promotion-closeout-run-invalid-source.json");

      await seedSharedEvidence(evidenceDir);
      await seedHorizonStatus(statusPath);
      await seedEnvFile(envPath);
      await writeFile(
        path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            closeout: {
              horizon: "H2",
              nextHorizon: "H3",
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const closeoutRunPath = path.join(evidenceDir, "h2-closeout-run-99999999999989.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            horizon: {
              source: "H2",
              next: "H3",
            },
            checks: {
              sourceHorizon: "NOT_A_SOURCE",
              h2CloseoutGatePass: true,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: true,
              supervisedSimulationStageGoalPolicyPropagationPassed: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
            },
            files: {
              closeoutOut: path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
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
          "scripts/run-h2-promotion.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          statusPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--closeout-run-out",
          closeoutRunPath,
        ],
        { timeoutMs: 180_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: {
          closeoutRunHorizonSourceInvalid: boolean;
          closeoutRunHorizonSourceInvalidValues: string[] | null;
          closeoutRunHorizonSourceAliasConflict: boolean;
          closeoutRunHorizonSourceMatches: boolean | null;
        };
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.closeoutRunHorizonSourceInvalid).toBe(true);
      expect(payload.checks.closeoutRunHorizonSourceInvalidValues).toContain("NOT_A_SOURCE");
      expect(payload.checks.closeoutRunHorizonSourceAliasConflict).toBe(false);
      expect(payload.checks.closeoutRunHorizonSourceMatches).toBe(true);
      expect(payload.failures).toContain("h2_closeout_run_horizon_source_invalid");
      expect(payload.failures).not.toContain("horizon_promotion_failed");
    });
  });

  it("fails when closeout artifact reports invalid next horizon token", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-promotion-closeout-artifact-invalid-next.json");

      await seedSharedEvidence(evidenceDir);
      await seedHorizonStatus(statusPath);
      await seedEnvFile(envPath);
      await writeFile(
        path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            closeout: {
              horizon: "H2",
              nextHorizon: "H3",
              targetNextHorizon: "BAD_TOKEN",
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const closeoutRunPath = path.join(evidenceDir, "h2-closeout-run-99999999999990.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            horizon: {
              source: "H2",
              next: "H3",
            },
            checks: {
              h2CloseoutGatePass: true,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: true,
              supervisedSimulationStageGoalPolicyPropagationPassed: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
            },
            files: {
              closeoutOut: path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
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
          "scripts/run-h2-promotion.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          statusPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--closeout-run-out",
          closeoutRunPath,
        ],
        { timeoutMs: 180_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: {
          closeoutRunCloseoutArtifactHorizonNextInvalid: boolean;
          closeoutRunCloseoutArtifactHorizonNextInvalidValues: string[] | null;
          closeoutRunCloseoutArtifactHorizonNextAliasConflict: boolean;
          closeoutRunCloseoutArtifactHorizonNextMatches: boolean | null;
        };
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.closeoutRunCloseoutArtifactHorizonNextInvalid).toBe(true);
      expect(payload.checks.closeoutRunCloseoutArtifactHorizonNextInvalidValues).toContain("BAD_TOKEN");
      expect(payload.checks.closeoutRunCloseoutArtifactHorizonNextAliasConflict).toBe(false);
      expect(payload.checks.closeoutRunCloseoutArtifactHorizonNextMatches).toBe(true);
      expect(payload.failures).toContain("h2_closeout_run_closeout_artifact_horizon_next_invalid");
      expect(payload.failures).not.toContain("horizon_promotion_failed");
    });
  });

  it("fails when closeout artifact reports invalid source horizon token", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-promotion-closeout-artifact-invalid-source.json");

      await seedSharedEvidence(evidenceDir);
      await seedHorizonStatus(statusPath);
      await seedEnvFile(envPath);
      await writeFile(
        path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            closeout: {
              horizon: "H2",
              sourceHorizon: "BAD_SOURCE_TOKEN",
              nextHorizon: "H3",
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const closeoutRunPath = path.join(evidenceDir, "h2-closeout-run-99999999999988.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            horizon: {
              source: "H2",
              next: "H3",
            },
            checks: {
              h2CloseoutGatePass: true,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: true,
              supervisedSimulationStageGoalPolicyPropagationPassed: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
            },
            files: {
              closeoutOut: path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
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
          "scripts/run-h2-promotion.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          statusPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--closeout-run-out",
          closeoutRunPath,
        ],
        { timeoutMs: 180_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: {
          closeoutRunCloseoutArtifactHorizonSourceInvalid: boolean;
          closeoutRunCloseoutArtifactHorizonSourceInvalidValues: string[] | null;
          closeoutRunCloseoutArtifactHorizonSourceAliasConflict: boolean;
          closeoutRunCloseoutArtifactHorizonSourceMatches: boolean | null;
        };
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.closeoutRunCloseoutArtifactHorizonSourceInvalid).toBe(true);
      expect(payload.checks.closeoutRunCloseoutArtifactHorizonSourceInvalidValues).toContain(
        "BAD_SOURCE_TOKEN",
      );
      expect(payload.checks.closeoutRunCloseoutArtifactHorizonSourceAliasConflict).toBe(false);
      expect(payload.checks.closeoutRunCloseoutArtifactHorizonSourceMatches).toBe(true);
      expect(payload.failures).toContain("h2_closeout_run_closeout_artifact_horizon_source_invalid");
      expect(payload.failures).not.toContain("horizon_promotion_failed");
    });
  });

  it("fails when closeout run and closeout artifact transitions disagree", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-promotion-closeout-run-artifact-disagree.json");

      await seedSharedEvidence(evidenceDir);
      await seedHorizonStatus(statusPath);
      await seedEnvFile(envPath);
      const mismatchedCloseoutPath = path.join(evidenceDir, "horizon-closeout-H2-20260426-disagree.json");
      await writeFile(
        mismatchedCloseoutPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            closeout: {
              horizon: "H2",
              nextHorizon: "H4",
            },
            checks: {
              nextHorizon: {
                selectedNextHorizon: "H4",
              },
            },
            failures: [],
          },
          null,
          2,
        ),
        "utf8",
      );

      const closeoutRunPath = path.join(evidenceDir, "h2-closeout-run-99999999999993.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            horizon: {
              source: "H2",
              next: "H3",
            },
            checks: {
              h2CloseoutGatePass: true,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: true,
              supervisedSimulationStageGoalPolicyPropagationPassed: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
            },
            files: {
              closeoutOut: mismatchedCloseoutPath,
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
          "scripts/run-h2-promotion.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          statusPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--closeout-run-out",
          closeoutRunPath,
        ],
        { timeoutMs: 180_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: {
          closeoutRunHorizonNextMatches: boolean | null;
          closeoutRunCloseoutArtifactHorizonNextMatches: boolean | null;
        };
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.closeoutRunHorizonNextMatches).toBe(true);
      expect(payload.checks.closeoutRunCloseoutArtifactHorizonNextMatches).toBe(false);
      expect(payload.failures).toContain("h2_closeout_run_closeout_artifact_horizon_next_mismatch");
      expect(payload.failures).not.toContain("horizon_promotion_failed");
    });
  });

  it("fails when closeout run reports conflicting closeout artifact path aliases", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-promotion-conflicting-closeout-path-aliases.json");

      await seedSharedEvidence(evidenceDir);
      await seedHorizonStatus(statusPath);
      await seedEnvFile(envPath);

      const closeoutPath = path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json");
      const alternateCloseoutPath = path.join(evidenceDir, "horizon-closeout-H2-20260426-alternate.json");
      await writeFile(
        closeoutPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            closeout: {
              horizon: "H2",
              nextHorizon: "H3",
            },
          },
          null,
          2,
        ),
        "utf8",
      );
      await writeFile(
        alternateCloseoutPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            closeout: {
              horizon: "H2",
              nextHorizon: "H3",
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const closeoutRunPath = path.join(evidenceDir, "h2-closeout-run-99999999999993.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            horizon: {
              source: "H2",
              next: "H3",
            },
            files: {
              closeoutOut: closeoutPath,
              closeoutFile: alternateCloseoutPath,
            },
            checks: {
              h2CloseoutGatePass: true,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: true,
              supervisedSimulationStageGoalPolicyPropagationPassed: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
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
          "scripts/run-h2-promotion.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          statusPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--closeout-run-out",
          closeoutRunPath,
        ],
        { timeoutMs: 180_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.failures).toContain("h2_closeout_run_conflicting_closeout_out_paths");
      expect(payload.failures).not.toContain("horizon_promotion_failed");
    });
  });

  it("accepts relative closeout path aliases resolved from manifest directory", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-promotion-relative-closeout-aliases.json");

      await seedSharedEvidence(evidenceDir);
      await seedHorizonStatus(statusPath);
      await seedEnvFile(envPath);

      const closeoutPath = path.join(evidenceDir, "horizon-closeout-H2-20260426-relative.json");
      await writeFile(
        closeoutPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            closeout: {
              horizon: "H2",
              nextHorizon: "H3",
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const closeoutRunPath = path.join(evidenceDir, "h2-closeout-run-99999999999992.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            horizon: {
              source: "H2",
              next: "H3",
            },
            files: {
              closeoutOut: "horizon-closeout-H2-20260426-relative.json",
              closeoutFile: "horizon-closeout-H2-20260426-relative.json",
            },
            closeoutOut: "horizon-closeout-H2-20260426-relative.json",
            checks: {
              h2CloseoutGatePass: true,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: true,
              supervisedSimulationStageGoalPolicyPropagationPassed: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
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
          "scripts/run-h2-promotion.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          statusPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--closeout-run-out",
          closeoutRunPath,
        ],
        { timeoutMs: 180_000 },
      );
      expect(result.code).toBe(0);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        files: {
          closeoutRunCloseoutOut: string | null;
        };
        checks: {
          closeoutRunCloseoutOutConflict: boolean;
        };
        failures: string[];
      };
      expect(payload.pass).toBe(true);
      expect(payload.checks.closeoutRunCloseoutOutConflict).toBe(false);
      expect(payload.files.closeoutRunCloseoutOut).toBe(path.resolve(closeoutPath));
      expect(payload.failures).toEqual([]);
    });
  });

  it("fails when closeout run omits horizon metadata for requested transition", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-promotion-missing-closeout-run-horizon.json");

      await seedSharedEvidence(evidenceDir);
      await seedHorizonStatus(statusPath);
      await seedEnvFile(envPath);
      await writeFile(
        path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            closeout: {
              horizon: "H2",
              nextHorizon: "H3",
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const closeoutRunPath = path.join(evidenceDir, "h2-closeout-run-99999999999994.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            checks: {
              h2CloseoutGatePass: true,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: true,
              supervisedSimulationStageGoalPolicyPropagationPassed: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
            },
            files: {
              closeoutOut: path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
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
          "scripts/run-h2-promotion.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          statusPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--closeout-run-out",
          closeoutRunPath,
        ],
        { timeoutMs: 180_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: {
          closeoutRunHorizonSourceMatches: boolean | null;
          closeoutRunHorizonNextMatches: boolean | null;
        };
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.closeoutRunHorizonSourceMatches).toBe(true);
      expect(payload.checks.closeoutRunHorizonNextMatches).toBe(null);
      expect(payload.failures).toContain("h2_closeout_run_horizon_next_not_reported");
      expect(payload.failures).not.toContain("horizon_promotion_failed");
    });
  });

  it("fails when closeout run references missing closeout artifact", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-promotion-missing-closeout-artifact.json");

      await seedSharedEvidence(evidenceDir);
      await seedHorizonStatus(statusPath);
      await seedEnvFile(envPath);

      const closeoutRunPath = path.join(evidenceDir, "h2-closeout-run-99999999999996.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            horizon: {
              source: "H2",
              next: "H3",
            },
            checks: {
              h2CloseoutGatePass: true,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: true,
              supervisedSimulationStageGoalPolicyPropagationPassed: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
            },
            files: {
              closeoutOut: path.join(evidenceDir, "horizon-closeout-H2-missing.json"),
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
          "scripts/run-h2-promotion.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          statusPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--closeout-run-out",
          closeoutRunPath,
        ],
        { timeoutMs: 180_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: {
          closeoutRunCloseoutArtifactPass: boolean | null;
        };
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.closeoutRunCloseoutArtifactPass).toBe(null);
      expect(payload.failures).toContain("h2_closeout_run_closeout_artifact_missing");
      expect(payload.failures).not.toContain("horizon_promotion_failed");
    });
  });

  it("fails when closeout artifact transition metadata mismatches requested transition", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-promotion-mismatched-closeout-artifact.json");

      await seedSharedEvidence(evidenceDir);
      await seedHorizonStatus(statusPath);
      await seedEnvFile(envPath);

      const mismatchedCloseoutPath = path.join(evidenceDir, "horizon-closeout-H2-20260426-mismatch.json");
      await writeFile(
        mismatchedCloseoutPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            closeout: {
              horizon: "H2",
              nextHorizon: "H4",
            },
            checks: {
              nextHorizon: {
                selectedNextHorizon: "H4",
              },
            },
            failures: [],
          },
          null,
          2,
        ),
        "utf8",
      );

      const closeoutRunPath = path.join(evidenceDir, "h2-closeout-run-99999999999995.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            horizon: {
              source: "H2",
              next: "H3",
            },
            checks: {
              h2CloseoutGatePass: true,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: true,
              supervisedSimulationStageGoalPolicyPropagationPassed: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
            },
            files: {
              closeoutOut: mismatchedCloseoutPath,
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
          "scripts/run-h2-promotion.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          statusPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--closeout-run-out",
          closeoutRunPath,
        ],
        { timeoutMs: 180_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: {
          closeoutRunCloseoutArtifactHorizonNextMatches: boolean | null;
        };
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.closeoutRunCloseoutArtifactHorizonNextMatches).toBe(false);
      expect(payload.failures).toContain("h2_closeout_run_closeout_artifact_horizon_next_mismatch");
      expect(payload.failures).not.toContain("horizon_promotion_failed");
    });
  });

  it("auto-loads co-located GOAL_POLICIES.json when explicit flag is omitted", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-promotion-default-goal-policy-file.json");
      await seedSharedEvidence(evidenceDir);
      await seedHorizonStatus(statusPath);
      await seedEnvFile(envPath);
      const defaultGoalPolicyPath = await seedDefaultGoalPolicyFileForStatus(statusPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/run-h2-promotion.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          statusPath,
          "--env-file",
          envPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--strict-goal-policy-gates",
          "--goal-policy-key",
          "H2->H3",
        ],
        { timeoutMs: 180_000 },
      );
      expect(result.code).toBe(0);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: {
          goalPolicyFile: string | null;
          progressiveGoalsPass: boolean;
          goalPolicyCoveragePass: boolean;
          goalPolicyReadinessAuditPass: boolean;
        };
      };
      expect(payload.pass).toBe(true);
      expect(payload.checks.goalPolicyFile).toBe(path.resolve(defaultGoalPolicyPath));
      expect(payload.checks.progressiveGoalsPass).toBe(true);
      expect(payload.checks.goalPolicyCoveragePass).toBe(true);
      expect(payload.checks.goalPolicyReadinessAuditPass).toBe(true);
    });
  });

  it("fails when required goal policy validation gate fails", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-promotion-validation-failure.json");
      const goalPolicyPath = path.join(dir, "GOAL_POLICY.json");

      await seedSharedEvidence(evidenceDir);
      await seedHorizonStatus(statusPath);
      await seedEnvFile(envPath);
      await seedGoalPolicyFile(goalPolicyPath);

      const policyPayload = JSON.parse(await readFile(goalPolicyPath, "utf8")) as {
        transitions?: Record<string, unknown>;
      };
      delete policyPayload.transitions?.["H2->H3"];
      await writeFile(goalPolicyPath, JSON.stringify(policyPayload, null, 2), "utf8");

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/run-h2-promotion.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          statusPath,
          "--env-file",
          envPath,
          "--goal-policy-file",
          goalPolicyPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--strict-goal-policy-gates",
          "--goal-policy-key",
          "H2->H3",
          "--require-goal-policy-validation",
        ],
        { timeoutMs: 180_000 },
      );
      expect(result.code).toBe(2);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: {
          goalPolicyValidationPass: boolean | null;
          requireGoalPolicyValidation: boolean;
          horizonPromotionPass: boolean;
        };
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.requireGoalPolicyValidation).toBe(true);
      expect(payload.checks.goalPolicyValidationPass).toBe(false);
      expect(payload.checks.horizonPromotionPass).toBe(false);
      expect(payload.failures).toContain("horizon_promotion_failed");
    });
  });

  it("fails strict promotion when goal policy file contains duplicate transition keys", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-promotion-duplicate-goal-policy-transitions.json");
      const goalPolicyPath = path.join(dir, "GOAL_POLICY_DUPLICATE.json");

      await seedSharedEvidence(evidenceDir);
      await seedHorizonStatus(statusPath);
      await seedEnvFile(envPath);
      await seedGoalPolicyFileWithDuplicateTransition(goalPolicyPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/run-h2-promotion.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          statusPath,
          "--env-file",
          envPath,
          "--goal-policy-file",
          goalPolicyPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--strict-goal-policy-gates",
          "--goal-policy-key",
          "H2->H3",
          "--require-goal-policy-validation",
        ],
        { timeoutMs: 180_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.failures).toContain("horizon_promotion_failed");
    });
  });

  it("fails strict promotion when goal policy file conflicts with horizon fallback policy", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "h2-promotion-source-consistency-conflict.json");
      const goalPolicyPath = path.join(dir, "GOAL_POLICY_CONFLICT.json");

      await seedSharedEvidence(evidenceDir);
      await seedHorizonStatus(statusPath);
      await seedMismatchedHorizonGoalPolicies(statusPath);
      await seedEnvFile(envPath);
      await seedMismatchedGoalPolicyFile(goalPolicyPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/run-h2-promotion.mjs",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          statusPath,
          "--env-file",
          envPath,
          "--goal-policy-file",
          goalPolicyPath,
          "--out",
          outPath,
          "--allow-horizon-mismatch",
          "--skip-cutover-readiness",
          "--strict-goal-policy-gates",
          "--goal-policy-key",
          "H2->H3",
          "--require-goal-policy-validation",
        ],
        { timeoutMs: 180_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: {
          goalPolicySourceConsistencyChecked: boolean;
          goalPolicySourceConsistencyPass: boolean;
          goalPolicySourceConsistencyConflictTransitions: string[] | null;
        };
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.goalPolicySourceConsistencyChecked).toBe(true);
      expect(payload.checks.goalPolicySourceConsistencyPass).toBe(false);
      expect(payload.checks.goalPolicySourceConsistencyConflictTransitions).toContain("H2->H3");
      expect(payload.failures).toContain("horizon_promotion_failed");
    });
  });
});
