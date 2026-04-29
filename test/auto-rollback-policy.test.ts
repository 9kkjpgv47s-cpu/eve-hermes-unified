import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "auto-rollback-policy-test-"));
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
    dispatchFailureRate?: number;
    policyFailureRate?: number;
    releasePass?: boolean;
    cutoverPass?: boolean;
    stagePromotionPass?: boolean;
    includeCooldownSignals?: boolean;
    createFailingLatestSummary?: boolean;
    createFailingLatestRelease?: boolean;
    createFailingLatestStagePromotion?: boolean;
    goalPolicyValidationPass?: boolean;
    stagePromotionMergeBundleGoalPolicyValidationPass?: boolean;
    stagePromotionMergeBundleInitialScopeGoalPolicyValidationPass?: boolean;
    stagePromotionBundleVerificationGoalPolicyValidationPass?: boolean;
    stagePromotionBundleVerificationInitialScopeGoalPolicyValidationPass?: boolean;
  },
): Promise<{
  validationPath: string;
  releasePath: string;
  cutoverPath: string;
  stagePromotionPath: string;
  failingValidationPath: string;
  failingReleasePath: string;
  failingStagePromotionPath: string;
}> {
  await mkdir(evidenceDir, { recursive: true });
  const stamp = "20260426-000000";
  const validationPath = path.join(evidenceDir, `validation-summary-${stamp}.json`);
  const releasePath = path.join(evidenceDir, `release-readiness-${stamp}.json`);
  const cutoverPath = path.join(evidenceDir, `cutover-readiness-${stamp}.json`);
  const stagePromotionPath = path.join(evidenceDir, `stage-promotion-readiness-${stamp}.json`);
  const failingValidationPath = path.join(evidenceDir, "validation-summary-20260426-999999.json");
  const failingReleasePath = path.join(evidenceDir, "release-readiness-20260426-999999.json");
  const failingStagePromotionPath = path.join(
    evidenceDir,
    "stage-promotion-readiness-20260426-999999.json",
  );

  const includeCooldownSignals = options?.includeCooldownSignals !== false;
  const failureInjectionPreview = includeCooldownSignals
    ? [
        {
          timestamp: new Date().toISOString(),
          responseClass: "fallback",
          failureClass: "cooldown",
          traceId: "trace-cooldown-1",
          durationMs: 101,
        },
        {
          timestamp: new Date().toISOString(),
          responseClass: "fallback",
          failureClass: "cooldown",
          traceId: "trace-cooldown-2",
          durationMs: 99,
        },
      ]
    : [];

  await writeFile(
    validationPath,
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        metrics: {
          successRate: options?.successRate ?? 1,
          p95LatencyMs: options?.p95LatencyMs ?? 300,
          missingTraceRate: options?.missingTraceRate ?? 0,
          unclassifiedFailures: options?.unclassifiedFailures ?? 0,
          failureScenarioPassCount: 5,
          dispatchFailureRate: options?.dispatchFailureRate ?? 0,
          policyFailureRate: options?.policyFailureRate ?? 0,
        },
        gates: {
          passed:
            (options?.successRate ?? 1) >= 0.99 &&
            (options?.missingTraceRate ?? 0) <= 0 &&
            (options?.unclassifiedFailures ?? 0) <= 0 &&
            (options?.p95LatencyMs ?? 300) <= 2500,
          failures: [],
        },
        failureInjectionPreview,
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
          validationSummary: validationPath,
          regression: null,
          cutoverReadiness: cutoverPath,
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
          cutoverReadinessPassed: options?.cutoverPass !== false,
          goalPolicyFileValidationPassed: options?.goalPolicyValidationPass !== false,
          goalPolicySourceConsistencyPassed: options?.goalPolicyValidationPass !== false,
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
    stagePromotionPath,
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        pass: options?.stagePromotionPass !== false,
        stage: {
          current: "canary",
          target: "majority",
          transitionAllowed: true,
        },
        checks: {
          validationSummaryPassed: true,
          cutoverReadinessPassed: options?.cutoverPass !== false,
          releaseReadinessPassed: options?.releasePass !== false,
          releaseReadinessGoalPolicyValidationPassed: options?.goalPolicyValidationPass !== false,
          releaseGoalPolicySourceConsistencyReported: options?.goalPolicyValidationPass !== null,
          releaseGoalPolicySourceConsistencyPassed: options?.goalPolicyValidationPass !== false,
          mergeBundleReleaseGoalPolicyValidationReported:
            options?.stagePromotionMergeBundleGoalPolicyValidationPass !== null,
          mergeBundleGoalPolicyValidationReported:
            options?.stagePromotionMergeBundleGoalPolicyValidationPass !== null,
          mergeBundleReleaseGoalPolicyValidationPassed:
            options?.stagePromotionMergeBundleGoalPolicyValidationPass !== false,
          mergeBundleGoalPolicyValidationPassed:
            options?.stagePromotionMergeBundleGoalPolicyValidationPass !== false,
          mergeBundleReleaseGoalPolicySourceConsistencyReported:
            options?.stagePromotionMergeBundleGoalPolicyValidationPass !== null,
          mergeBundleReleaseGoalPolicySourceConsistencyPassed:
            options?.stagePromotionMergeBundleGoalPolicyValidationPass !== false,
          mergeBundleGoalPolicySourceConsistencyReported:
            options?.stagePromotionMergeBundleGoalPolicyValidationPass !== null,
          mergeBundleGoalPolicySourceConsistencyPassed:
            options?.stagePromotionMergeBundleGoalPolicyValidationPass !== false,
          mergeBundleInitialScopeGoalPolicyValidationReported:
            options?.stagePromotionMergeBundleInitialScopeGoalPolicyValidationPass !== null,
          mergeBundleInitialScopeGoalPolicyValidationPassed:
            options?.stagePromotionMergeBundleInitialScopeGoalPolicyValidationPass !== false,
          bundleVerificationReleaseGoalPolicyValidationReported:
            options?.stagePromotionBundleVerificationGoalPolicyValidationPass !== null,
          bundleVerificationGoalPolicyValidationReported:
            options?.stagePromotionBundleVerificationGoalPolicyValidationPass !== null,
          bundleVerificationReleaseGoalPolicyValidationPassed:
            options?.stagePromotionBundleVerificationGoalPolicyValidationPass !== false,
          bundleVerificationGoalPolicyValidationPassed:
            options?.stagePromotionBundleVerificationGoalPolicyValidationPass !== false,
          bundleVerificationReleaseGoalPolicySourceConsistencyReported:
            options?.stagePromotionBundleVerificationGoalPolicyValidationPass !== null,
          bundleVerificationReleaseGoalPolicySourceConsistencyPassed:
            options?.stagePromotionBundleVerificationGoalPolicyValidationPass !== false,
          bundleVerificationGoalPolicySourceConsistencyReported:
            options?.stagePromotionBundleVerificationGoalPolicyValidationPass !== null,
          bundleVerificationGoalPolicySourceConsistencyPassed:
            options?.stagePromotionBundleVerificationGoalPolicyValidationPass !== false,
          bundleVerificationInitialScopeGoalPolicyValidationReported:
            options?.stagePromotionBundleVerificationInitialScopeGoalPolicyValidationPass !== null,
          bundleVerificationInitialScopeGoalPolicyValidationPassed:
            options?.stagePromotionBundleVerificationInitialScopeGoalPolicyValidationPass !== false,
          bundleVerificationSelectionSignalReported: true,
          bundleVerificationSelectionProofPassed: true,
          bundleVerificationLatestRequestedReported: true,
          bundleVerificationLatestRequested: false,
          bundleVerificationLatestAliasResolved: false,
          bundleVerificationLatestAliasFallbackUsed: false,
          bundleVerificationValidationManifestResolvedReported: true,
          bundleVerificationValidationManifestResolved: true,
          bundleVerificationValidationManifestPath: path.join(
            evidenceDir,
            `merge-bundle-validation-${stamp}.json`,
          ),
          bundleVerificationValidationManifestPathReported: true,
          selectedMergeBundleValidationPath: null,
          selectedMergeBundleValidationPathReported: false,
          bundleVerificationValidationManifestMatchesSelectedMergeBundleValidation: true,
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

  if (options?.createFailingLatestSummary === true) {
    await writeFile(
      failingValidationPath,
      JSON.stringify(
        {
          generatedAtIso: new Date().toISOString(),
          metrics: {
            successRate: 0.75,
            p95LatencyMs: 3500,
            missingTraceRate: 0.25,
            unclassifiedFailures: 4,
            failureScenarioPassCount: 1,
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
      failingReleasePath,
      JSON.stringify(
        {
          readinessVersion: "v1",
          generatedAtIso: new Date().toISOString(),
          defaultValidationCommand: "validate:all",
          pass: false,
          files: {
            validationSummary: failingValidationPath,
            regression: null,
            cutoverReadiness: cutoverPath,
            failureInjection: null,
            soak: null,
            goalPolicyFileValidation: null,
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

  if (options?.createFailingLatestStagePromotion === true) {
    await writeFile(
      failingStagePromotionPath,
      JSON.stringify(
        {
          generatedAtIso: new Date().toISOString(),
          pass: false,
          stage: {
            current: "canary",
            target: "majority",
            transitionAllowed: false,
          },
          checks: {
            validationSummaryPassed: false,
            cutoverReadinessPassed: false,
            releaseReadinessPassed: false,
            mergeBundleGoalPolicyValidationReported: false,
            mergeBundleGoalPolicyValidationPassed: false,
            mergeBundleInitialScopeGoalPolicyValidationReported: false,
            mergeBundleInitialScopeGoalPolicyValidationPassed: false,
            bundleVerificationGoalPolicyValidationReported: false,
            bundleVerificationGoalPolicyValidationPassed: false,
            bundleVerificationInitialScopeGoalPolicyValidationReported: false,
            bundleVerificationInitialScopeGoalPolicyValidationPassed: false,
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

  return {
    validationPath,
    releasePath,
    cutoverPath,
    stagePromotionPath,
    failingValidationPath,
    failingReleasePath,
    failingStagePromotionPath,
  };
}

async function seedHorizonStatus(horizonPath: string): Promise<void> {
  await writeFile(
    horizonPath,
    JSON.stringify(
      {
        schemaVersion: "v1",
        updatedAtIso: new Date().toISOString(),
        owner: "cloud-agent",
        activeHorizon: "H2",
        activeStatus: "in_progress",
        summary: "H2 rollback policy simulation",
        blockers: [],
        requiredEvidence: [
          {
            id: "h2-evidence-summary",
            command: "npm run validate:evidence-summary",
            artifactPattern: "evidence/validation-summary-*.json",
            required: true,
          },
          {
            id: "h2-release-readiness",
            command: "npm run validate:release-readiness",
            artifactPattern: "evidence/release-readiness-*.json",
            required: true,
          },
          {
            id: "h2-cutover-readiness",
            command: "npm run validate:cutover-readiness",
            artifactPattern: "evidence/cutover-readiness-*.json",
            required: true,
          },
        ],
        nextActions: [
          {
            id: "h2-action-1",
            summary: "run canary drill",
            targetHorizon: "H2",
            status: "in_progress",
          },
        ],
        promotionReadiness: {
          targetStage: "canary",
          gates: {
            releaseReadinessPass: true,
            mergeBundlePass: false,
            bundleVerificationPass: false,
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

describe("evaluate-auto-rollback-policy.mjs", () => {
  it("holds traffic when metrics are healthy", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "rollback-policy.json");
      await seedEvidence(evidenceDir, {
        successRate: 0.997,
        p95LatencyMs: 900,
        missingTraceRate: 0,
        unclassifiedFailures: 0,
        includeCooldownSignals: false,
      });
      await seedHorizonStatus(horizonPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/evaluate-auto-rollback-policy.mjs",
          "--stage",
          "canary",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--out",
          outPath,
        ],
        { timeoutMs: 20_000 },
      );
      expect(result.code).toBe(0);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        decision: { action: string };
        reasons: string[];
      };
      expect(payload.pass).toBe(true);
      expect(payload.decision.action).toBe("hold");
      expect(payload.reasons).toEqual([]);
    });
  });

  it("triggers canary rollback when dispatch failure rate exceeds threshold despite high success rate", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "rollback-policy.json");
      await seedEvidence(evidenceDir, {
        successRate: 0.999,
        p95LatencyMs: 200,
        missingTraceRate: 0,
        unclassifiedFailures: 0,
        dispatchFailureRate: 0.25,
        policyFailureRate: 0,
        includeCooldownSignals: false,
      });
      await seedHorizonStatus(horizonPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/evaluate-auto-rollback-policy.mjs",
          "--stage",
          "canary",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--out",
          outPath,
        ],
        { timeoutMs: 20_000 },
      );
      expect(result.code).toBe(2);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        decision: { action: string };
        reasons: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.decision.action).toBe("rollback");
      expect(
        payload.reasons.some((reason) => reason.startsWith("dispatch_failure_rate_above_threshold")),
      ).toBe(true);
    });
  });

  it("triggers rollback on sustained threshold violations", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "rollback-policy.json");
      await seedEvidence(evidenceDir, {
        successRate: 0.93,
        p95LatencyMs: 3200,
        missingTraceRate: 0.02,
        unclassifiedFailures: 1,
      });
      await seedHorizonStatus(horizonPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/evaluate-auto-rollback-policy.mjs",
          "--stage",
          "majority",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--out",
          outPath,
        ],
        { timeoutMs: 20_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        decision: { action: string };
        reasons: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.decision.action).toBe("rollback");
      expect(payload.reasons.some((reason) => reason.startsWith("success_rate_below_threshold"))).toBe(true);
      expect(payload.reasons.some((reason) => reason.startsWith("p95_latency_above_threshold"))).toBe(true);
    });
  });

  it("triggers rollback when release/cutover/stage readiness fail", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "rollback-policy.json");
      await seedEvidence(evidenceDir, {
        successRate: 0.999,
        p95LatencyMs: 200,
        missingTraceRate: 0,
        unclassifiedFailures: 0,
        releasePass: false,
        cutoverPass: false,
        stagePromotionPass: false,
        includeCooldownSignals: false,
      });
      await seedHorizonStatus(horizonPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/evaluate-auto-rollback-policy.mjs",
          "--stage",
          "canary",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--out",
          outPath,
        ],
        { timeoutMs: 20_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        decision: { action: string };
        reasons: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.decision.action).toBe("rollback");
      expect(payload.reasons).toContain("release_readiness_failed");
      expect(payload.reasons).toContain("cutover_readiness_failed");
      expect(payload.reasons).toContain("stage_promotion_readiness_failed");
    });
  });

  it("triggers rollback when goal-policy validation check fails", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "rollback-policy.json");
      await seedEvidence(evidenceDir, {
        successRate: 0.999,
        p95LatencyMs: 200,
        missingTraceRate: 0,
        unclassifiedFailures: 0,
        goalPolicyValidationPass: false,
        includeCooldownSignals: false,
      });
      await seedHorizonStatus(horizonPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/evaluate-auto-rollback-policy.mjs",
          "--stage",
          "canary",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--out",
          outPath,
        ],
        { timeoutMs: 20_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        decision: { action: string };
        reasons: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.decision.action).toBe("rollback");
      expect(payload.reasons).toContain("release_goal_policy_file_validation_not_passed");
    });
  });

  it("fails in latest mode when newest evidence is failing", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "rollback-policy.json");
      await seedEvidence(evidenceDir, {
        successRate: 0.999,
        p95LatencyMs: 200,
        missingTraceRate: 0,
        unclassifiedFailures: 0,
        includeCooldownSignals: false,
        createFailingLatestSummary: true,
      });
      await seedHorizonStatus(horizonPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/evaluate-auto-rollback-policy.mjs",
          "--stage",
          "canary",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--out",
          outPath,
          "--evidence-selection-mode",
          "latest",
        ],
        { timeoutMs: 20_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        decision: { action: string };
        reasons: string[];
        checks: { evidenceSelectionMode: string };
      };
      expect(payload.pass).toBe(false);
      expect(payload.decision.action).toBe("rollback");
      expect(payload.checks.evidenceSelectionMode).toBe("latest");
      expect(payload.reasons).toContain("validation_summary_gate_failed");
    });
  });

  it("uses latest-passing mode to avoid stale failing newest evidence", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "rollback-policy.json");
      await seedEvidence(evidenceDir, {
        successRate: 0.999,
        p95LatencyMs: 200,
        missingTraceRate: 0,
        unclassifiedFailures: 0,
        includeCooldownSignals: false,
        createFailingLatestSummary: true,
      });
      await seedHorizonStatus(horizonPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/evaluate-auto-rollback-policy.mjs",
          "--stage",
          "canary",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--out",
          outPath,
          "--evidence-selection-mode",
          "latest-passing",
        ],
        { timeoutMs: 20_000 },
      );
      expect(result.code).toBe(0);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        decision: { action: string };
        reasons: string[];
        checks: { evidenceSelectionMode: string };
      };
      expect(payload.pass).toBe(true);
      expect(payload.decision.action).toBe("hold");
      expect(payload.reasons).toEqual([]);
      expect(payload.checks.evidenceSelectionMode).toBe("latest-passing");
    });
  });

  it("uses latest-passing mode across summary/release/stage artifacts", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "rollback-policy.json");
      await seedEvidence(evidenceDir, {
        successRate: 0.999,
        p95LatencyMs: 200,
        missingTraceRate: 0,
        unclassifiedFailures: 0,
        includeCooldownSignals: false,
        createFailingLatestSummary: true,
        createFailingLatestRelease: true,
        createFailingLatestStagePromotion: true,
      });
      await seedHorizonStatus(horizonPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/evaluate-auto-rollback-policy.mjs",
          "--stage",
          "canary",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--out",
          outPath,
          "--evidence-selection-mode",
          "latest-passing",
        ],
        { timeoutMs: 20_000 },
      );
      expect(result.code).toBe(0);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        files: {
          validationSummary: string;
          releaseReadiness: string;
          stagePromotionReadiness: string;
        };
      };
      expect(payload.pass).toBe(true);
      expect(payload.files.validationSummary.endsWith("20260426-000000.json")).toBe(true);
      expect(payload.files.releaseReadiness.endsWith("20260426-000000.json")).toBe(true);
      expect(payload.files.stagePromotionReadiness.endsWith("20260426-000000.json")).toBe(true);
    });
  });
});
