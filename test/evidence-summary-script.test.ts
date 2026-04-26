import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evidence-summary-script-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("summarize-evidence.mjs", () => {
  it("writes passing summary for valid evidence set", async () => {
    await withTempDir(async (dir) => {
      const soakPath = path.join(dir, "soak-20260101-000000.jsonl");
      const failurePath = path.join(dir, "failure-injection-20260101-000000.txt");
      const summaryPath = path.join(dir, "summary.json");

      await writeFile(
        soakPath,
        `${JSON.stringify({
          envelope: { traceId: "trace-1" },
          response: { failureClass: "none" },
        })}\n`,
        "utf8",
      );
      await writeFile(
        failurePath,
        ["Failure injection smoke started", "traceId=trace-1", "Failure injection smoke ended"].join("\n"),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/summarize-evidence.mjs",
          "--evidence-dir",
          dir,
          "--out",
          summaryPath,
          "--min-success-rate",
          "0.99",
        ],
        { timeoutMs: 5_000 },
      );
      expect(result.code).toBe(0);
      const raw = await readFile(summaryPath, "utf8");
      expect(raw).toContain("\"passed\": true");
      expect(raw).toContain("\"successRate\": 1");
    });
  });

  it("parses multi-line pretty JSON emitted by dispatch CLI", async () => {
    await withTempDir(async (dir) => {
      const soakPath = path.join(dir, "soak-20260101-000000.jsonl");
      const failurePath = path.join(dir, "failure-injection-20260101-000000.txt");
      const summaryPath = path.join(dir, "summary.json");

      await writeFile(
        soakPath,
        `${JSON.stringify(
          {
            envelope: { traceId: "trace-ml-1" },
            response: { failureClass: "none", traceId: "trace-ml-1" },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await writeFile(
        failurePath,
        ["Failure injection smoke started", "traceId=trace-ml-1", "Failure injection smoke ended"].join("\n"),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/summarize-evidence.mjs",
          "--evidence-dir",
          dir,
          "--out",
          summaryPath,
          "--min-success-rate",
          "0.99",
          "--max-missing-trace-rate",
          "0",
        ],
        { timeoutMs: 5_000 },
      );
      expect(result.code).toBe(0);
      const raw = await readFile(summaryPath, "utf8");
      expect(raw).toContain("\"successRecords\": 1");
      expect(raw).toContain("\"missingTraceCount\": 0");
    });
  });

  it("fails when soak evidence has missing trace IDs", async () => {
    await withTempDir(async (dir) => {
      const soakPath = path.join(dir, "soak-20260101-000000.jsonl");
      const failurePath = path.join(dir, "failure-injection-20260101-000000.txt");
      const summaryPath = path.join(dir, "summary.json");

      await writeFile(
        soakPath,
        `${JSON.stringify({
          envelope: {},
          response: { failureClass: "none" },
        })}\n`,
        "utf8",
      );
      await writeFile(
        failurePath,
        ["Failure injection smoke started", "Failure injection smoke ended"].join("\n"),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/summarize-evidence.mjs",
          "--evidence-dir",
          dir,
          "--out",
          summaryPath,
          "--max-missing-trace-rate",
          "0",
        ],
        { timeoutMs: 5_000 },
      );
      expect(result.code).toBe(2);
      expect(result.stderr).toContain("Evidence gate failures");
      const raw = await readFile(summaryPath, "utf8");
      expect(raw).toContain("\"missingTraceCount\": 1");
    });
  });
});
