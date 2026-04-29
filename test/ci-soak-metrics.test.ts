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

function compactDispatchLine(overrides: { failureClass?: string; elapsedMs?: number } = {}) {
  const failureClass = overrides.failureClass ?? "none";
  const elapsedMs = overrides.elapsedMs ?? 10;
  return JSON.stringify({
    contractVersion: "v1",
    envelope: {
      traceId: "t1",
      channel: "telegram",
      chatId: "1",
      messageId: "1",
      receivedAtIso: "2026-04-28T12:00:00.000Z",
      text: "x",
    },
    routing: {
      primaryLane: "eve",
      fallbackLane: "none",
      reason: "r",
      policyVersion: "v1",
      failClosed: false,
    },
    primaryState: {
      status: failureClass === "none" ? "pass" : "failed",
      reason: "ok",
      runtimeUsed: "eve",
      runId: "r1",
      elapsedMs,
      failureClass,
      sourceLane: "eve",
      sourceChatId: "1",
      sourceMessageId: "1",
      traceId: "t1",
    },
    response: {
      consumed: true,
      responseText: "ok",
      failureClass,
      laneUsed: "eve",
      traceId: "t1",
    },
  });
}

describe("ci-soak-metrics-from-jsonl.mjs", () => {
  it("parses compact JSONL and counts failure classes", async () => {
    await withTempDir(async (dir) => {
      const jsonl = path.join(dir, "soak.jsonl");
      const metricsOut = path.join(dir, "metrics.json");
      await writeFile(
        jsonl,
        [
          compactDispatchLine(),
          compactDispatchLine({ failureClass: "dispatch_failure" }),
          compactDispatchLine({ failureClass: "policy_failure" }),
        ].join("\n"),
        "utf8",
      );
      const result = await runCommandWithTimeout(
        ["node", "scripts/ci-soak-metrics-from-jsonl.mjs", "--input", jsonl, "--out", metricsOut],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(0);
      const metrics = JSON.parse(await readFile(metricsOut, "utf8")) as {
        totalRecords: number;
        successRate: number;
        dispatchFailureRate: number;
        policyFailureRate: number;
        latencySampleCount: number;
      };
      expect(metrics.totalRecords).toBe(3);
      expect(metrics.successRate).toBeCloseTo(1 / 3, 5);
      expect(metrics.dispatchFailureRate).toBeCloseTo(1 / 3, 5);
      expect(metrics.policyFailureRate).toBeCloseTo(1 / 3, 5);
      expect(metrics.latencySampleCount).toBe(3);
    });
  });

  it("does not count zero latency when primaryState elapsed is absent", async () => {
    await withTempDir(async (dir) => {
      const jsonl = path.join(dir, "soak.jsonl");
      const metricsOut = path.join(dir, "metrics.json");
      const line = JSON.parse(compactDispatchLine()) as Record<string, unknown>;
      delete (line.primaryState as { elapsedMs?: number }).elapsedMs;
      await writeFile(jsonl, `${JSON.stringify(line)}\n`, "utf8");
      const result = await runCommandWithTimeout(
        ["node", "scripts/ci-soak-metrics-from-jsonl.mjs", "--input", jsonl, "--out", metricsOut],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(0);
      const metrics = JSON.parse(await readFile(metricsOut, "utf8")) as { latencySampleCount: number };
      expect(metrics.latencySampleCount).toBe(0);
    });
  });
});

describe("ci-soak-slo-gate.mjs", () => {
  it("passes when metrics are within env thresholds", async () => {
    await withTempDir(async (dir) => {
      const metricsPath = path.join(dir, "m.json");
      await writeFile(
        metricsPath,
        JSON.stringify({
          successRate: 0.99,
          missingTraceRate: 0,
          unclassifiedFailures: 0,
          p95LatencyMs: 100,
          dispatchFailureRate: 0.01,
          policyFailureRate: 0.01,
        }),
        "utf8",
      );
      const result = await runCommandWithTimeout(
        ["node", "scripts/ci-soak-slo-gate.mjs", "--metrics", metricsPath],
        {
          timeoutMs: 10_000,
          env: {
            ...process.env,
            UNIFIED_SOAK_MIN_SUCCESS_RATE: "0.95",
            UNIFIED_SOAK_MAX_MISSING_TRACE_RATE: "0.05",
            UNIFIED_SOAK_MAX_UNCLASSIFIED_FAILURES: "10",
            UNIFIED_SOAK_MAX_P95_LATENCY_MS: "500",
            UNIFIED_SOAK_MAX_DISPATCH_FAILURE_RATE: "0.1",
            UNIFIED_SOAK_MAX_POLICY_FAILURE_RATE: "0.1",
          },
        },
      );
      expect(result.code).toBe(0);
    });
  });

  it("fails when dispatchFailureRate exceeds threshold", async () => {
    await withTempDir(async (dir) => {
      const metricsPath = path.join(dir, "m.json");
      await writeFile(
        metricsPath,
        JSON.stringify({
          successRate: 0.99,
          missingTraceRate: 0,
          unclassifiedFailures: 0,
          p95LatencyMs: 100,
          dispatchFailureRate: 0.5,
          policyFailureRate: 0,
        }),
        "utf8",
      );
      const result = await runCommandWithTimeout(
        ["node", "scripts/ci-soak-slo-gate.mjs", "--metrics", metricsPath],
        {
          timeoutMs: 10_000,
          env: {
            ...process.env,
            UNIFIED_SOAK_MIN_SUCCESS_RATE: "0.95",
            UNIFIED_SOAK_MAX_MISSING_TRACE_RATE: "0.05",
            UNIFIED_SOAK_MAX_UNCLASSIFIED_FAILURES: "10",
            UNIFIED_SOAK_MAX_P95_LATENCY_MS: "500",
            UNIFIED_SOAK_MAX_DISPATCH_FAILURE_RATE: "0.1",
            UNIFIED_SOAK_MAX_POLICY_FAILURE_RATE: "0.1",
          },
        },
      );
      expect(result.code).toBe(2);
      expect(result.stderr).toMatch(/dispatchFailureRate/i);
    });
  });
});
