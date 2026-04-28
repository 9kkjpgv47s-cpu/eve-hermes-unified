import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

describe("summarize-soak-jsonl.mjs", () => {
  it("summarizes valid soak lines and writes output", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "soak-sum-"));
    try {
      const input = path.join(dir, "in.jsonl");
      const out = path.join(dir, "summary.json");
      const line1 = `${JSON.stringify({
        envelope: { traceId: "t1" },
        routing: { reason: "r1" },
        response: { failureClass: "none", laneUsed: "eve" },
        primaryState: { failureClass: "none" },
      })}\n`;
      const line2 = `${JSON.stringify({
        envelope: { traceId: "t2" },
        routing: { reason: "r2" },
        response: { failureClass: "dispatch_failure", laneUsed: "hermes" },
        primaryState: { failureClass: "dispatch_failure" },
      })}\n`;
      await writeFile(input, line1 + line2, "utf8");
      const result = await runCommandWithTimeout(
        ["node", "scripts/summarize-soak-jsonl.mjs", "--input", input, "--out", out],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(0);
      const summary = JSON.parse(await readFile(out, "utf8"));
      expect(summary.lineCount).toBe(2);
      expect(summary.failureClassCounts.none).toBe(1);
      expect(summary.failureClassCounts.dispatch_failure).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
