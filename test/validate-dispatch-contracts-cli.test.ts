import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

describe("validate-dispatch-contracts.ts CLI", () => {
  it("validates a single fixture file with --file", async () => {
    const result = await runCommandWithTimeout(
      [
        "npx",
        "--no-install",
        "tsx",
        "src/bin/validate-dispatch-contracts.ts",
        "--file",
        "test/fixtures/contracts/unified-dispatch-result-v1-pass.json",
      ],
      { timeoutMs: 60_000 },
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("OK: validated");
  });

  it("fails on invalid JSON dispatch shape", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "dispatch-contract-cli-"));
    try {
      const badPath = path.join(dir, "bad.json");
      await writeFile(badPath, '{"not":"a dispatch result"}\n', "utf8");
      const result = await runCommandWithTimeout(
        ["npx", "--no-install", "tsx", "src/bin/validate-dispatch-contracts.ts", "--file", badPath],
        { timeoutMs: 60_000 },
      );
      expect(result.code).not.toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails when contractVersion is wrong", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "dispatch-contract-cli-"));
    try {
      const raw = await readFile(
        path.join(process.cwd(), "test/fixtures/contracts/unified-dispatch-result-v1-pass.json"),
        "utf8",
      );
      const obj = JSON.parse(raw) as { contractVersion: string };
      obj.contractVersion = "v0";
      const badPath = path.join(dir, "wrong-version.json");
      await writeFile(badPath, JSON.stringify(obj), "utf8");
      const result = await runCommandWithTimeout(
        ["npx", "--no-install", "tsx", "src/bin/validate-dispatch-contracts.ts", "--file", badPath],
        { timeoutMs: 60_000 },
      );
      expect(result.code).not.toBe(0);
      expect(result.stderr).toMatch(/contractVersion/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
