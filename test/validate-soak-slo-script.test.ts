import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "soak-slo-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("validate-soak-slo.mjs", () => {
  it("passes when success rate meets default thresholds", async () => {
    await withTempDir(async (dir) => {
      const soakPath = path.join(dir, "soak-test.jsonl");
      const lines = [];
      for (let i = 0; i < 10; i += 1) {
        lines.push(
          JSON.stringify({
            envelope: { traceId: `t-${i}`, chatId: "1", messageId: String(i) },
            response: { failureClass: "none", traceId: `t-${i}` },
            primaryState: { elapsedMs: 1 },
          }),
        );
      }
      await writeFile(soakPath, `${lines.join("\n")}\n`, "utf8");
      const result = await runCommandWithTimeout(
        ["node", "scripts/validate-soak-slo.mjs", "--file", soakPath, "--out", path.join(dir, "slo.json")],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(0);
      const out = JSON.parse(await readFile(path.join(dir, "slo.json"), "utf8")) as { pass: boolean };
      expect(out.pass).toBe(true);
    });
  });

  it("parses pretty-printed multi-line dispatch JSON in soak jsonl", async () => {
    await withTempDir(async (dir) => {
      const soakPath = path.join(dir, "soak-multiline.jsonl");
      const dispatch = {
        envelope: { traceId: "trace-a", chatId: "1", messageId: "1" },
        response: { failureClass: "none", traceId: "trace-a" },
        primaryState: { elapsedMs: 3 },
      };
      const pretty = `${JSON.stringify(dispatch, null, 2)}\n${JSON.stringify({ soakMeta: true, iteration: 1 }, null, 2)}\n`;
      await writeFile(soakPath, pretty, "utf8");
      const result = await runCommandWithTimeout(
        ["node", "scripts/validate-soak-slo.mjs", "--file", soakPath, "--out", path.join(dir, "slo.json")],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(0);
      const out = JSON.parse(await readFile(path.join(dir, "slo.json"), "utf8")) as {
        pass: boolean;
        checks: { dispatchRecordCount: number };
      };
      expect(out.pass).toBe(true);
      expect(out.checks.dispatchRecordCount).toBe(1);
    });
  });
});
