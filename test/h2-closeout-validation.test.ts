import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "h2-closeout-validation-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function seedRequiredEvidence(evidenceDir: string): Promise<void> {
  await mkdir(evidenceDir, { recursive: true });
  const stamp = "20260426-000000";
  await writeFile(
    path.join(evidenceDir, `validation-summary-${stamp}.json`),
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        metrics: {
          successRate: 1,
          missingTraceRate: 0,
          unclassifiedFailures: 0,
          p95LatencyMs: 500,
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
    path.join(evidenceDir, `release-readiness-${stamp}.json`),
    JSON.stringify(
      {
        readinessVersion: "v1",
        generatedAtIso: new Date().toISOString(),
        defaultValidationCommand: "validate:all",
        pass: true,
        files: {
          validationSummary: path.join(evidenceDir, `validation-summary-${stamp}.json`),
          regression: null,
          cutoverReadiness: null,
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
    path.join(evidenceDir, `cutover-readiness-${stamp}.json`),
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
        stage: {
          current: "canary",
          target: "majority",
          transitionAllowed: true,
        },
        checks: {
          releaseGoalPolicySourceConsistencyReported: true,
          releaseGoalPolicySourceConsistencyPass: true,
          releaseGoalPolicySourceConsistencyPassed: true,
          mergeBundleReleaseGoalPolicySourceConsistencyReported: true,
          mergeBundleReleaseGoalPolicySourceConsistencyPass: true,
          mergeBundleReleaseGoalPolicySourceConsistencyPassed: true,
          bundleVerificationReleaseGoalPolicySourceConsistencyReported: true,
          bundleVerificationReleaseGoalPolicySourceConsistencyPass: true,
          bundleVerificationReleaseGoalPolicySourceConsistencyPassed: true,
        },
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
  await writeFile(
    path.join(evidenceDir, `rollback-threshold-calibration-majority-${stamp}.json`),
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        pass: true,
        stage: "majority",
        samples: [
          {
            file: path.join(evidenceDir, `validation-summary-${stamp}.json`),
            generatedAtIso: new Date().toISOString(),
            gatesPassed: true,
            metrics: {
              successRate: 1,
              missingTraceRate: 0,
              unclassifiedFailures: 0,
              p95LatencyMs: 500,
              failureScenarioPassCount: 5,
            },
          },
        ],
        calibration: {
          recommendedThresholds: {
            minSuccessRate: 0.995,
            maxMissingTraceRate: 0,
            maxUnclassifiedFailures: 0,
            minFailureScenarioPassCount: 5,
            maxP95LatencyMs: 1200,
          },
          recommendedPolicyArgs: [
            "--min-success-rate",
            "0.995",
            "--max-missing-trace-rate",
            "0",
            "--max-unclassified-failures",
            "0",
            "--min-failure-scenario-pass-count",
            "5",
            "--max-p95-latency-ms",
            "1200",
          ],
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(
    path.join(evidenceDir, `supervised-rollback-simulation-${stamp}.json`),
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
          evidenceSelectionMode: "latest-passing",
          stageDrillGoalPolicyValidationPropagationReported: true,
          stageDrillGoalPolicyValidationPropagationPassed: true,
          stageDrillGoalPolicySourceConsistencyPropagationReported: true,
          stageDrillGoalPolicySourceConsistencyPropagationPassed: true,
          stageDrillMergeBundleGoalPolicyValidationReported: true,
          stageDrillMergeBundleGoalPolicyValidationPassed: true,
          stageDrillMergeBundleGoalPolicySourceConsistencyReported: true,
          stageDrillMergeBundleGoalPolicySourceConsistencyPassed: true,
          stageDrillMergeBundleInitialScopeGoalPolicyValidationReported: true,
          stageDrillMergeBundleInitialScopeGoalPolicyValidationPassed: true,
          stageDrillBundleVerificationGoalPolicyValidationReported: true,
          stageDrillBundleVerificationGoalPolicyValidationPassed: true,
          stageDrillBundleVerificationGoalPolicySourceConsistencyReported: true,
          stageDrillBundleVerificationGoalPolicySourceConsistencyPassed: true,
          stageDrillBundleVerificationInitialScopeGoalPolicyValidationReported: true,
          stageDrillBundleVerificationInitialScopeGoalPolicyValidationPassed: true,
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
        updatedAtIso: new Date().toISOString(),
        owner: "cloud-agent",
        activeHorizon: "H2",
        activeStatus: "in_progress",
        summary: "H2 closeout fixture",
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
            targetHorizons: ["H2"],
          },
          {
            id: "h2-rollback-threshold-calibration",
            command: "npm run calibrate:rollback-thresholds",
            artifactPattern: "evidence/rollback-threshold-calibration-majority-*.json",
            required: true,
            targetHorizons: ["H2"],
          },
          {
            id: "h2-supervised-rollback-simulation",
            command: "npm run run:supervised-rollback-simulation",
            artifactPattern: "evidence/supervised-rollback-simulation-*.json",
            required: true,
            targetHorizons: ["H2"],
          },
        ],
        nextActions: [
          {
            id: "h2-action-1",
            summary: "seed",
            targetHorizon: "H2",
            status: "completed",
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

describe("validate-horizon-closeout.mjs (H2)", () => {
  it("passes when H2-specific required evidence is present and passing", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "h2-closeout.json");
      await seedRequiredEvidence(evidenceDir);
      await seedHorizonStatus(horizonPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-horizon-closeout.mjs",
          "--horizon",
          "H2",
          "--next-horizon",
          "H3",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--out",
          outPath,
        ],
        { timeoutMs: 30_000 },
      );
      if (result.code !== 0) {
        throw new Error(
          `expected H2 closeout pass but got code=${String(result.code)}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
        );
      }
      expect(result.code).toBe(0);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: { requiredEvidence: Array<{ id: string; pass: boolean }> };
        failures: string[];
      };
      expect(payload.pass).toBe(true);
      expect(payload.failures).toEqual([]);
      expect(
        payload.checks.requiredEvidence.some(
          (item) => item.id === "h2-drill-suite" && item.pass === true,
        ),
      ).toBe(true);
      expect(
        payload.checks.requiredEvidence.some(
          (item) => item.id === "h2-rollback-threshold-calibration" && item.pass === true,
        ),
      ).toBe(true);
      expect(
        payload.checks.requiredEvidence.some(
          (item) => item.id === "h2-supervised-rollback-simulation" && item.pass === true,
        ),
      ).toBe(true);
    });
  });

  it("fails when H2 supervised rollback simulation evidence is missing", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "h2-closeout.json");
      await seedRequiredEvidence(evidenceDir);
      await seedHorizonStatus(horizonPath);
      await rm(path.join(evidenceDir, "supervised-rollback-simulation-20260426-000000.json"), {
        force: true,
      });

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-horizon-closeout.mjs",
          "--horizon",
          "H2",
          "--next-horizon",
          "H3",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--out",
          outPath,
        ],
        { timeoutMs: 30_000 },
      );
      expect(result.code).toBe(2);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: {
          requiredEvidence: Array<{ id: string; pass: boolean; checks: string[] }>;
        };
      };
      expect(payload.pass).toBe(false);
      expect(payload.failures).toContain(
        "missing_required_evidence:h2-supervised-rollback-simulation",
      );
    });
  });

  it("fails when H2 drill suite artifact is schema-invalid", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "h2-closeout.json");
      await seedRequiredEvidence(evidenceDir);
      await seedHorizonStatus(horizonPath);

      const drillSuitePath = path.join(evidenceDir, "h2-drill-suite-20260426-000000.json");
      const drillSuitePayload = JSON.parse(await readFile(drillSuitePath, "utf8")) as {
        checks?: Record<string, unknown>;
      };
      delete drillSuitePayload.checks;
      await writeFile(drillSuitePath, `${JSON.stringify(drillSuitePayload, null, 2)}\n`, "utf8");

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-horizon-closeout.mjs",
          "--horizon",
          "H2",
          "--next-horizon",
          "H3",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--out",
          outPath,
        ],
        { timeoutMs: 30_000 },
      );
      expect(result.code).toBe(2);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: { requiredEvidence: Array<{ id: string; pass: boolean; checks: string[] }> };
      };
      expect(payload.pass).toBe(false);
      expect(payload.failures).toContain("required_evidence_failed:h2-drill-suite");
      expect(payload.checks.requiredEvidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "h2-drill-suite",
            pass: false,
            checks: expect.arrayContaining([
              expect.stringContaining("horizon_drill_suite_schema_invalid:checks must be an object"),
              expect.stringContaining("h2_drill_suite_schema_invalid:checks must be an object"),
            ]),
          }),
        ]),
      );
    });
  });

  it("fails when release readiness goal-policy validation is not passed", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "h2-closeout.json");
      await seedRequiredEvidence(evidenceDir);
      await seedHorizonStatus(horizonPath);

      const releasePath = path.join(evidenceDir, "release-readiness-20260426-000000.json");
      const releasePayload = JSON.parse(await readFile(releasePath, "utf8")) as {
        checks?: Record<string, unknown>;
      };
      if (!releasePayload.checks || typeof releasePayload.checks !== "object") {
        throw new Error("missing release readiness checks fixture");
      }
      releasePayload.checks.goalPolicyFileValidationPassed = false;
      await writeFile(releasePath, `${JSON.stringify(releasePayload, null, 2)}\n`, "utf8");

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-horizon-closeout.mjs",
          "--horizon",
          "H2",
          "--next-horizon",
          "H3",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--out",
          outPath,
        ],
        { timeoutMs: 30_000 },
      );
      expect(result.code).toBe(2);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: {
          requiredEvidence: Array<{
            id: string;
            pass: boolean;
            checks: string[];
          }>;
        };
      };
      expect(payload.pass).toBe(false);
      expect(payload.failures).toContain("required_evidence_failed:h1-release-readiness");
      expect(payload.checks.requiredEvidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "h1-release-readiness",
            pass: false,
            checks: expect.arrayContaining(["release_goal_policy_validation_not_passed"]),
          }),
        ]),
      );
    });
  });

  it("fails when bundle verification goal-policy propagation is missing", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "h2-closeout.json");
      await seedRequiredEvidence(evidenceDir);
      await seedHorizonStatus(horizonPath);

      const verifyPath = path.join(evidenceDir, "bundle-verification-20260426-000000.json");
      const verificationPayload = JSON.parse(await readFile(verifyPath, "utf8")) as {
        checks?: Record<string, unknown>;
      };
      verificationPayload.checks = {
        ...(verificationPayload.checks ?? {}),
      };
      delete verificationPayload.checks.releaseGoalPolicyValidationReported;
      delete verificationPayload.checks.releaseGoalPolicyValidationPassed;
      delete verificationPayload.checks.initialScopeGoalPolicyValidationReported;
      delete verificationPayload.checks.initialScopeGoalPolicyValidationPassed;
      await writeFile(verifyPath, `${JSON.stringify(verificationPayload, null, 2)}\n`, "utf8");

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-horizon-closeout.mjs",
          "--horizon",
          "H2",
          "--next-horizon",
          "H3",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--out",
          outPath,
        ],
        { timeoutMs: 30_000 },
      );
      expect(result.code).toBe(2);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
        checks: { requiredEvidence: Array<{ id: string; pass: boolean; checks: string[] }> };
      };
      expect(payload.pass).toBe(false);
      expect(payload.failures).toContain("required_evidence_failed:h1-bundle-verification");
      expect(payload.checks.requiredEvidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "h1-bundle-verification",
            pass: false,
            checks: expect.arrayContaining([
              "bundle_verify_release_goal_policy_validation_not_reported",
              "bundle_verify_initial_scope_goal_policy_validation_not_reported",
            ]),
          }),
        ]),
      );
    });
  });
});
