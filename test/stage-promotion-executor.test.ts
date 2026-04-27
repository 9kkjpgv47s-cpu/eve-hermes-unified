import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "stage-promotion-executor-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function seedEvidence(evidenceDir: string): Promise<void> {
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
        pass: true,
        checks: {
          releaseGoalPolicyValidationReported: true,
          releaseGoalPolicyValidationPassed: true,
          initialScopeGoalPolicyValidationReported: true,
          initialScopeGoalPolicyValidationPassed: true,
        },
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
        summary: "Promotion executor test",
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
            id: "h2-promotion",
            summary: "Run stage promotion",
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

describe("promote-cutover-stage.mjs", () => {
  it("promotes stage when readiness passes", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "stage-promotion-execution.json");
      const readinessPath = path.join(evidenceDir, "stage-promotion-readiness.json");
      await seedEvidence(evidenceDir);
      await seedHorizonStatus(horizonPath);
      await seedEnvFile(envPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/promote-cutover-stage.mjs",
          "--target-stage",
          "canary",
          "--env-file",
          envPath,
          "--horizon-status-file",
          horizonPath,
          "--evidence-dir",
          evidenceDir,
          "--out",
          outPath,
          "--readiness-out",
          readinessPath,
          "--canary-chats",
          "100,200",
        ],
        { timeoutMs: 20_000 },
      );
      expect(result.code).toBe(0);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        promoted: boolean;
        checks: { readinessPassed: boolean; stageApplied: boolean };
        stage: { envStageAfter: string };
      };
      expect(payload.pass).toBe(true);
      expect(payload.promoted).toBe(true);
      expect(payload.checks.readinessPassed).toBe(true);
      expect(payload.checks.stageApplied).toBe(true);
      expect(payload.stage.envStageAfter).toBe("canary");
      const envContent = await readFile(envPath, "utf8");
      expect(envContent).toContain("UNIFIED_ROUTER_CUTOVER_STAGE=canary");
      expect(envContent).toContain("UNIFIED_ROUTER_CANARY_CHAT_IDS=100,200");
    });
  });

  it("does not apply stage when readiness fails", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "stage-promotion-execution.json");
      const readinessPath = path.join(evidenceDir, "stage-promotion-readiness.json");
      await seedEvidence(evidenceDir);
      await seedHorizonStatus(horizonPath);
      await seedEnvFile(envPath);
      await rm(path.join(evidenceDir, "cutover-readiness-20260426-000000.json"), { force: true });

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/promote-cutover-stage.mjs",
          "--target-stage",
          "canary",
          "--env-file",
          envPath,
          "--horizon-status-file",
          horizonPath,
          "--evidence-dir",
          evidenceDir,
          "--out",
          outPath,
          "--readiness-out",
          readinessPath,
        ],
        { timeoutMs: 20_000 },
      );
      expect(result.code).toBe(2);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        promoted: boolean;
        checks: { readinessPassed: boolean; stageApplied: boolean };
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.promoted).toBe(false);
      expect(payload.checks.readinessPassed).toBe(false);
      expect(payload.checks.stageApplied).toBe(false);
      expect(payload.failures).toContain("readiness_check_failed");
      const envContent = await readFile(envPath, "utf8");
      expect(envContent).toContain("UNIFIED_ROUTER_CUTOVER_STAGE=shadow");
    });
  });

  it("reports readiness pass but skips apply on dry-run", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(evidenceDir, "stage-promotion-execution.json");
      const readinessPath = path.join(evidenceDir, "stage-promotion-readiness.json");
      await seedEvidence(evidenceDir);
      await seedHorizonStatus(horizonPath);
      await seedEnvFile(envPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/promote-cutover-stage.mjs",
          "--target-stage",
          "canary",
          "--env-file",
          envPath,
          "--horizon-status-file",
          horizonPath,
          "--evidence-dir",
          evidenceDir,
          "--out",
          outPath,
          "--readiness-out",
          readinessPath,
          "--dry-run",
        ],
        { timeoutMs: 20_000 },
      );
      expect(result.code).toBe(0);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        promoted: boolean;
        dryRun: boolean;
        checks: { readinessPassed: boolean; stageApplied: boolean };
        stage: { envStageAfter: string };
      };
      expect(payload.pass).toBe(true);
      expect(payload.dryRun).toBe(true);
      expect(payload.promoted).toBe(false);
      expect(payload.checks.readinessPassed).toBe(true);
      expect(payload.checks.stageApplied).toBe(false);
      expect(payload.stage.envStageAfter).toBe("shadow");
      const envContent = await readFile(envPath, "utf8");
      expect(envContent).toContain("UNIFIED_ROUTER_CUTOVER_STAGE=shadow");
    });
  });
});
