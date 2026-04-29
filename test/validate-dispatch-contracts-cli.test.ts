import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "validate-dispatch-contracts-cli-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("validate-dispatch-contracts.ts CLI", () => {
  it("validates default fixture set with exit 0", async () => {
    const result = await runCommandWithTimeout(
      ["npx", "--no-install", "tsx", "src/bin/validate-dispatch-contracts.ts"],
      { timeoutMs: 60_000 },
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("OK:");
  });

  it("validates a single file with --file", async () => {
    await withTempDir(async (dir) => {
      const fixture = path.join(dir, "result.json");
      await writeFile(
        fixture,
        JSON.stringify(
          {
            contractVersion: "v1",
            envelope: {
              traceId: "t-cli",
              channel: "telegram",
              chatId: "1",
              messageId: "1",
              receivedAtIso: "2026-04-28T12:00:00.000Z",
              text: "hi",
            },
            routing: {
              primaryLane: "eve",
              fallbackLane: "none",
              reason: "r",
              policyVersion: "v1",
              failClosed: false,
            },
            primaryState: {
              status: "pass",
              reason: "ok",
              runtimeUsed: "eve",
              runId: "r1",
              elapsedMs: 1,
              failureClass: "none",
              sourceLane: "eve",
              sourceChatId: "1",
              sourceMessageId: "1",
              traceId: "t-cli",
            },
            response: {
              consumed: true,
              responseText: "ok",
              failureClass: "none",
              laneUsed: "eve",
              traceId: "t-cli",
            },
          },
          null,
          2,
        ),
        "utf8",
      );
      const result = await runCommandWithTimeout(
        ["npx", "--no-install", "tsx", "src/bin/validate-dispatch-contracts.ts", "--file", fixture],
        { timeoutMs: 60_000 },
      );
      expect(result.code).toBe(0);
    });
  });

  it("fails on invalid JSON", async () => {
    await withTempDir(async (dir) => {
      const bad = path.join(dir, "bad.json");
      await writeFile(bad, "{ not json", "utf8");
      const result = await runCommandWithTimeout(
        ["npx", "--no-install", "tsx", "src/bin/validate-dispatch-contracts.ts", "--file", bad],
        { timeoutMs: 60_000 },
      );
      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/failed|Unexpected token/i);
    });
  });

  it("fails when contractVersion is wrong", async () => {
    await withTempDir(async (dir) => {
      const fixture = path.join(dir, "wrong-version.json");
      const raw = await readFile("test/fixtures/contracts/unified-dispatch-result-v1-pass.json", "utf8");
      const parsed = JSON.parse(raw) as { contractVersion: string };
      parsed.contractVersion = "v0";
      await writeFile(fixture, JSON.stringify(parsed), "utf8");
      const result = await runCommandWithTimeout(
        ["npx", "--no-install", "tsx", "src/bin/validate-dispatch-contracts.ts", "--file", fixture],
        { timeoutMs: 60_000 },
      );
      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/contractVersion/i);
    });
  });
});
