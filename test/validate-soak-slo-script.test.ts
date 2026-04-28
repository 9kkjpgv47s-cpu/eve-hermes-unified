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
});
