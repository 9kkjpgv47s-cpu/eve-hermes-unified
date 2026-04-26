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
          bundleFailures: [],
        },
        failures: [],
      },
      null,
      2,
    ),
    "utf8",
  );

  await writeFile(verifyPath, JSON.stringify({ pass: true }, null, 2), "utf8");
  await writeFile(
    path.join(evidenceDir, `stage-promotion-readiness-${stamp}.json`),
    JSON.stringify({ pass: options?.stagePromotionPass !== false }, null, 2),
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
        { timeoutMs: 60_000 },
      );
      expect(result.code).toBe(0);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: {
          canaryHoldPass: boolean;
          majorityHoldPass: boolean | null;
          rollbackSimulationPass: boolean | null;
          rollbackSimulationTriggered: boolean;
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
});
