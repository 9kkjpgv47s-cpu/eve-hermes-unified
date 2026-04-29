import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

describe("h5-evidence-baseline.mjs", () => {
  it("writes a passing manifest when core evidence files exist", async () => {
    const d = path.join(os.tmpdir(), `h5-bl-${Date.now()}`);
    const evidenceDir = path.join(d, "evidence");
    await mkdir(evidenceDir, { recursive: true });
    try {
      await writeFile(
        path.join(evidenceDir, "soak-test.jsonl"),
        `${JSON.stringify({
          envelope: { traceId: "a", chatId: "1", messageId: "1" },
          response: { failureClass: "none", traceId: "a" },
          primaryState: { elapsedMs: 1 },
        })}\n`,
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, "validation-summary-test.json"),
        JSON.stringify(
          {
            metrics: { p95LatencyMs: 5 },
            gates: { passed: true },
          },
          null,
          2,
        ),
        "utf8",
      );
      await writeFile(path.join(evidenceDir, "failure-injection-test.txt"), "ok\n", "utf8");
      await writeFile(
        path.join(evidenceDir, "cutover-readiness-test.json"),
        JSON.stringify({ pass: true }, null, 2),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, "regression-eve-primary-test.json"),
        JSON.stringify({ pass: true }, null, 2),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        ["node", "scripts/h5-evidence-baseline.mjs", "--evidence-dir", evidenceDir],
        { timeoutMs: 30_000 },
      );
      expect(result.code).toBe(0);
      const outLine = result.stdout.trim().split("\n").filter(Boolean).at(-1) ?? "";
      expect(outLine).toContain("h5-evidence-baseline-");
      const payload = JSON.parse(await readFile(outLine, "utf8")) as { pass: boolean };
      expect(payload.pass).toBe(true);
    } finally {
      await rm(d, { recursive: true, force: true });
    }
  });
});
