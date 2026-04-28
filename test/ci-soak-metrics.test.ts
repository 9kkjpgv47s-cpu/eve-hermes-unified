import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

const root = process.cwd();

function sampleDispatch(i: number) {
  return {
    contractVersion: "v1",
    envelope: {
      traceId: `t-${i}`,
      channel: "telegram",
      chatId: "1",
      messageId: String(i),
      receivedAtIso: "2026-01-01T00:00:00.000Z",
      text: "hi",
    },
    routing: {
      primaryLane: "hermes",
      fallbackLane: "none",
      reason: "r",
      policyVersion: "v1",
      failClosed: true,
    },
    primaryState: {
      status: "pass",
      reason: "ok",
      runtimeUsed: "hermes",
      runId: `run-${i}`,
      elapsedMs: 10 + i,
      failureClass: "none",
      sourceLane: "hermes",
      sourceChatId: "1",
      sourceMessageId: String(i),
      traceId: `t-${i}`,
    },
    response: {
      consumed: true,
      responseText: "ok",
      failureClass: "none",
      laneUsed: "hermes",
      traceId: `t-${i}`,
    },
  };
}

describe("ci-soak-metrics-from-jsonl.mjs", () => {
  it("parses compact-jsonl and emits metrics", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "soak-metrics-"));
    try {
      const jsonl = path.join(dir, "soak.jsonl");
      const metricsPath = path.join(dir, "metrics.json");
      const lines = [sampleDispatch(1), sampleDispatch(2)].map((o) => JSON.stringify(o)).join("\n");
      await writeFile(jsonl, `${lines}\n`, "utf8");
      const result = await runCommandWithTimeout(
        ["node", `${root}/scripts/ci-soak-metrics-from-jsonl.mjs`, "--input", jsonl, "--out", metricsPath],
        { timeoutMs: 30_000 },
      );
      expect(result.code).toBe(0);
      const metrics = JSON.parse(await readFile(metricsPath, "utf8")) as {
        totalRecords: number;
        successRate: number;
      };
      expect(metrics.totalRecords).toBe(2);
      expect(metrics.successRate).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("ci-soak-slo-gate.mjs", () => {
  it("passes when thresholds are loose", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "soak-slo-"));
    try {
      const metricsPath = path.join(dir, "m.json");
      await writeFile(
        metricsPath,
        JSON.stringify({
          successRate: 1,
          missingTraceRate: 0,
          unclassifiedFailures: 0,
          p95LatencyMs: 100,
          dispatchFailureRate: 0,
          policyFailureRate: 0,
        }),
        "utf8",
      );
      const result = await runCommandWithTimeout(
        [
          "env",
          "UNIFIED_SOAK_MIN_SUCCESS_RATE=0.5",
          "UNIFIED_SOAK_MAX_MISSING_TRACE_RATE=0.5",
          "UNIFIED_SOAK_MAX_UNCLASSIFIED_FAILURES=10",
          "UNIFIED_SOAK_MAX_P95_LATENCY_MS=1000",
          "UNIFIED_SOAK_MAX_DISPATCH_FAILURE_RATE=0.5",
          "UNIFIED_SOAK_MAX_POLICY_FAILURE_RATE=0.5",
          "node",
          `${root}/scripts/ci-soak-slo-gate.mjs`,
          "--metrics",
          metricsPath,
        ],
        { timeoutMs: 30_000 },
      );
      expect(result.code).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails when success rate is below threshold", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "soak-slo-"));
    try {
      const metricsPath = path.join(dir, "m.json");
      await writeFile(
        metricsPath,
        JSON.stringify({
          successRate: 0.5,
          missingTraceRate: 0,
          unclassifiedFailures: 0,
          p95LatencyMs: 100,
          dispatchFailureRate: 0,
          policyFailureRate: 0,
        }),
        "utf8",
      );
      const result = await runCommandWithTimeout(
        [
          "env",
          "UNIFIED_SOAK_MIN_SUCCESS_RATE=0.99",
          "node",
          `${root}/scripts/ci-soak-slo-gate.mjs`,
          "--metrics",
          metricsPath,
        ],
        { timeoutMs: 30_000 },
      );
      expect(result.code).not.toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
