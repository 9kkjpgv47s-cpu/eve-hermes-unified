import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evidence-gates-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("evidence-gates.mjs", () => {
  it("passes when all required failure scenarios are present", async () => {
    await withTempDir(async (dir) => {
      const summaryPath = path.join(dir, "summary.json");
      const failurePath = path.join(dir, "failure.txt");
      await writeFile(
        summaryPath,
        JSON.stringify(
          {
            metrics: {
              totalRecords: 10,
              successRecords: 10,
              successRate: 1,
              missingTraceCount: 0,
              missingTraceRate: 0,
              unclassifiedFailures: 0,
              p95ElapsedMs: 120,
            },
            gates: { passed: true, failures: [] },
          },
          null,
          2,
        ),
        "utf8",
      );
      await writeFile(
        failurePath,
        [
          "Case 1: Eve lane command timeout",
          "Case 2: Hermes lane non-zero exit",
          "Case 3: Synthetic provider-limit response mapping",
          "Case 4: Dispatch-state read mismatch",
          "Case 5: Policy fail-closed path with no fallback",
        ].join("\n"),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/evidence-gates.mjs",
          "--summary",
          summaryPath,
          "--failure-report",
          failurePath,
          "--require-failure-scenarios",
          "1",
        ],
        { timeoutMs: 5_000 },
      );

      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout.trim());
      expect(payload.pass).toBe(true);
      expect(payload.failureScenarioCoverage.covered).toBe(5);
    });
  });

  it("fails when required failure scenario coverage is incomplete", async () => {
    await withTempDir(async (dir) => {
      const summaryPath = path.join(dir, "summary.json");
      const failurePath = path.join(dir, "failure.txt");
      await writeFile(
        summaryPath,
        JSON.stringify(
          {
            metrics: {
              totalRecords: 10,
              successRecords: 10,
              successRate: 1,
              missingTraceCount: 0,
              missingTraceRate: 0,
              unclassifiedFailures: 0,
              p95ElapsedMs: 120,
            },
            gates: { passed: true, failures: [] },
          },
          null,
          2,
        ),
        "utf8",
      );
      await writeFile(
        failurePath,
        ["Case 1: Eve lane command timeout", "Case 2: Hermes lane non-zero exit"].join("\n"),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/evidence-gates.mjs",
          "--summary",
          summaryPath,
          "--failure-report",
          failurePath,
          "--require-failure-scenarios",
          "1",
        ],
        { timeoutMs: 5_000 },
      );

      expect(result.code).toBe(2);
      expect(result.stderr).toContain("Missing required failure scenarios");
      const payload = JSON.parse(result.stdout.trim());
      expect(payload.pass).toBe(false);
      expect(payload.failureScenarioCoverage.covered).toBe(2);
      expect(payload.failureScenarioCoverage.missing.length).toBe(3);
    });
  });

  it("fails when p95 exceeds configured threshold", async () => {
    await withTempDir(async (dir) => {
      const summaryPath = path.join(dir, "summary.json");
      const failurePath = path.join(dir, "failure.txt");
      await writeFile(
        summaryPath,
        JSON.stringify(
          {
            metrics: {
              totalRecords: 10,
              successRecords: 10,
              successRate: 1,
              missingTraceCount: 0,
              missingTraceRate: 0,
              unclassifiedFailures: 0,
              p95ElapsedMs: 320,
            },
            gates: { passed: true, failures: [] },
          },
          null,
          2,
        ),
        "utf8",
      );
      await writeFile(
        failurePath,
        [
          "Case 1: Eve lane command timeout",
          "Case 2: Hermes lane non-zero exit",
          "Case 3: Synthetic provider-limit response mapping",
          "Case 4: Dispatch-state read mismatch",
          "Case 5: Policy fail-closed path with no fallback",
        ].join("\n"),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/evidence-gates.mjs",
          "--summary",
          summaryPath,
          "--failure-report",
          failurePath,
          "--max-p95-ms",
          "200",
          "--require-failure-scenarios",
          "1",
        ],
        { timeoutMs: 5_000 },
      );

      expect(result.code).toBe(2);
      expect(result.stderr).toContain("p95 latency gate failed");
      const payload = JSON.parse(result.stdout.trim());
      expect(payload.pass).toBe(false);
      expect(payload.p95ElapsedMs).toBe(320);
      expect(payload.maxP95Ms).toBe(200);
    });
  });
});
