import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "rollback-threshold-calibration-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeValidationSummary(
  evidenceDir: string,
  stamp: string,
  metrics: {
    successRate: number;
    missingTraceRate: number;
    unclassifiedFailures: number;
    p95LatencyMs: number;
    failureScenarioPassCount: number;
    dispatchFailureRate?: number;
    policyFailureRate?: number;
  },
  passed: boolean,
): Promise<string> {
  await mkdir(evidenceDir, { recursive: true });
  const target = path.join(evidenceDir, `validation-summary-${stamp}.json`);
  await writeFile(
    target,
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        metrics: {
          ...metrics,
          dispatchFailureRate: metrics.dispatchFailureRate ?? 0,
          policyFailureRate: metrics.policyFailureRate ?? 0,
        },
        gates: {
          passed,
          failures: passed ? [] : ["synthetic-failure"],
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  return target;
}

describe("calibrate-rollback-thresholds.mjs", () => {
  it("uses latest-passing mode by default and computes thresholds from passing summaries", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const outPath = path.join(evidenceDir, "calibration.json");
      await writeValidationSummary(
        evidenceDir,
        "20260426-000001",
        {
          successRate: 0.998,
          missingTraceRate: 0,
          unclassifiedFailures: 0,
          p95LatencyMs: 800,
          failureScenarioPassCount: 5,
        },
        true,
      );
      await writeValidationSummary(
        evidenceDir,
        "20260426-000002",
        {
          successRate: 0.999,
          missingTraceRate: 0,
          unclassifiedFailures: 0,
          p95LatencyMs: 900,
          failureScenarioPassCount: 5,
        },
        true,
      );
      await writeValidationSummary(
        evidenceDir,
        "20260426-999999",
        {
          successRate: 0.5,
          missingTraceRate: 0.5,
          unclassifiedFailures: 10,
          p95LatencyMs: 5000,
          failureScenarioPassCount: 1,
        },
        false,
      );

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/calibrate-rollback-thresholds.mjs",
          "--stage",
          "majority",
          "--evidence-dir",
          evidenceDir,
          "--out",
          outPath,
          "--window",
          "2",
          "--min-samples",
          "2",
        ],
        { timeoutMs: 20_000 },
      );
      expect(result.code).toBe(0);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        selection: { evidenceSelectionMode: string; selectedSampleCount: number };
        observed: { minSuccessRate: number; maxP95LatencyMs: number };
        calibration: {
          recommendedThresholds: {
            minSuccessRate: number;
            maxP95LatencyMs: number;
            maxMissingTraceRate: number;
            maxUnclassifiedFailures: number;
            minFailureScenarioPassCount: number;
            maxDispatchFailureRate: number;
            maxPolicyFailureRate: number;
          };
          recommendedPolicyArgs: string[];
        };
      };
      expect(payload.pass).toBe(true);
      expect(payload.selection.evidenceSelectionMode).toBe("latest-passing");
      expect(payload.selection.selectedSampleCount).toBe(2);
      expect(payload.observed.minSuccessRate).toBe(0.998);
      expect(payload.calibration.recommendedThresholds.minSuccessRate).toBe(0.9975);
      expect(payload.calibration.recommendedThresholds.maxP95LatencyMs).toBe(1150);
      expect(payload.calibration.recommendedThresholds.maxMissingTraceRate).toBe(0);
      expect(payload.calibration.recommendedThresholds.maxUnclassifiedFailures).toBe(0);
      expect(payload.calibration.recommendedThresholds.minFailureScenarioPassCount).toBe(5);
      expect(payload.calibration.recommendedThresholds.maxDispatchFailureRate).toBe(0.002);
      expect(payload.calibration.recommendedThresholds.maxPolicyFailureRate).toBe(0.002);
      expect(payload.calibration.recommendedPolicyArgs).toEqual([
        "--min-success-rate",
        "0.9975",
        "--max-missing-trace-rate",
        "0",
        "--max-unclassified-failures",
        "0",
        "--min-failure-scenario-pass-count",
        "5",
        "--max-p95-latency-ms",
        "1150",
        "--max-dispatch-failure-rate",
        "0.002",
        "--max-policy-failure-rate",
        "0.002",
      ]);
    });
  });

  it("fails when sample count is below min-samples", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const outPath = path.join(evidenceDir, "calibration.json");
      await writeValidationSummary(
        evidenceDir,
        "20260426-000001",
        {
          successRate: 0.999,
          missingTraceRate: 0,
          unclassifiedFailures: 0,
          p95LatencyMs: 700,
          failureScenarioPassCount: 5,
        },
        true,
      );

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/calibrate-rollback-thresholds.mjs",
          "--stage",
          "canary",
          "--evidence-dir",
          evidenceDir,
          "--out",
          outPath,
          "--min-samples",
          "2",
        ],
        { timeoutMs: 20_000 },
      );
      expect(result.code).toBe(2);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.failures.some((item) => item.startsWith("insufficient_samples:"))).toBe(
        true,
      );
    });
  });
});
