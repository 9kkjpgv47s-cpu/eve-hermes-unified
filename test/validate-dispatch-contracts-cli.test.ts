import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

describe("validate-dispatch-contracts.ts", () => {
  it("validates a single file via --file", async () => {
    const fixture = path.join(process.cwd(), "test/fixtures/unified-dispatch-result-v1-primary-pass.json");
    const result = await runCommandWithTimeout(
      ["npx", "--no-install", "tsx", "src/bin/validate-dispatch-contracts.ts", "--file", fixture],
      { timeoutMs: 15_000 },
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("OK: validated 1 dispatch result(s)");
  });

  it("fails on invalid JSON file", async () => {
    const badPath = path.join(os.tmpdir(), `bad-dispatch-${Date.now()}.json`);
    await writeFile(badPath, '{"contractVersion":"v1","envelope":', "utf8");
    const result = await runCommandWithTimeout(
      ["npx", "--no-install", "tsx", "src/bin/validate-dispatch-contracts.ts", "--file", badPath],
      { timeoutMs: 15_000 },
    );
    expect(result.code).not.toBe(0);
  });
});
