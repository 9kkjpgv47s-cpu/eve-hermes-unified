import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ci-soak-metrics-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("ci-soak-metrics-from-jsonl.mjs", () => {
  it("parses pretty-printed dispatch objects appended to one file", async () => {
    await withTempDir(async (dir) => {
      const soakPath = path.join(dir, "soak.jsonl");
      const metricsPath = path.join(dir, "metrics.json");
      const obj1 = {
        envelope: { traceId: "a" },
        primaryState: { elapsedMs: 10 },
        response: { failureClass: "none", traceId: "a" },
      };
      const obj2 = {
        envelope: { traceId: "b" },
        primaryState: { elapsedMs: 20 },
        response: { failureClass: "none", traceId: "b" },
      };
      await writeFile(soakPath, `${JSON.stringify(obj1, null, 2)}\n${JSON.stringify(obj2, null, 2)}\n`, "utf8");

      const result = await runCommandWithTimeout(
        ["node", "scripts/ci-soak-metrics-from-jsonl.mjs", "--in", soakPath, "--out", metricsPath],
        { timeoutMs: 5_000 },
      );
      expect(result.code).toBe(0);
      const doc = JSON.parse(await readFile(metricsPath, "utf8"));
      expect(doc.metrics.iterations).toBe(2);
      expect(doc.metrics.successCount).toBe(2);
      expect(doc.metrics.missingTraceCount).toBe(0);
      expect(doc.metrics.latencySampleCount).toBe(2);
    });
  });

  it("does not count latency when elapsed fields are absent", async () => {
    await withTempDir(async (dir) => {
      const soakPath = path.join(dir, "soak.jsonl");
      const metricsPath = path.join(dir, "metrics.json");
      await writeFile(
        soakPath,
        `${JSON.stringify(
          {
            envelope: { traceId: "x" },
            response: { failureClass: "none", traceId: "x" },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      const result = await runCommandWithTimeout(
        ["node", "scripts/ci-soak-metrics-from-jsonl.mjs", "--in", soakPath, "--out", metricsPath],
        { timeoutMs: 5_000 },
      );
      expect(result.code).toBe(0);
      const doc = JSON.parse(await readFile(metricsPath, "utf8"));
      expect(doc.metrics.latencySampleCount).toBe(0);
      expect(doc.metrics.p95PrimaryElapsedMs).toBeNull();
    });
  });
});

describe("ci-soak-slo-gate.mjs", () => {
  it("exits 0 when default SLOs are met", async () => {
    await withTempDir(async (dir) => {
      const metricsPath = path.join(dir, "metrics.json");
      await writeFile(
        metricsPath,
        JSON.stringify({
          metrics: {
            iterations: 10,
            successRate: 1,
            missingTraceRate: 0,
            unclassifiedFailures: 0,
            p95PrimaryElapsedMs: 100,
          },
        }),
        "utf8",
      );
      const result = await runCommandWithTimeout(
        ["node", "scripts/ci-soak-slo-gate.mjs", "--metrics", metricsPath],
        { timeoutMs: 5_000 },
      );
      expect(result.code).toBe(0);
      const out = JSON.parse(result.stdout.trim());
      expect(out.pass).toBe(true);
    });
  });

  it("exits 2 when success rate is below UNIFIED_SOAK_MIN_SUCCESS_RATE", async () => {
    await withTempDir(async (dir) => {
      const metricsPath = path.join(dir, "metrics.json");
      await writeFile(
        metricsPath,
        JSON.stringify({
          metrics: {
            iterations: 100,
            successRate: 0.5,
            missingTraceRate: 0,
            unclassifiedFailures: 0,
            p95PrimaryElapsedMs: 1,
          },
        }),
        "utf8",
      );
      const result = await runCommandWithTimeout(
        ["node", "scripts/ci-soak-slo-gate.mjs", "--metrics", metricsPath],
        { timeoutMs: 5_000, env: { ...process.env, UNIFIED_SOAK_MIN_SUCCESS_RATE: "0.99" } },
      );
      expect(result.code).toBe(2);
      const out = JSON.parse(result.stdout.trim());
      expect(out.pass).toBe(false);
      expect(out.failures.some((f: string) => f.includes("successRate"))).toBe(true);
    });
  });
});
