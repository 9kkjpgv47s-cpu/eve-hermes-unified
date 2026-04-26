import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withEnvFile(
  run: (envPath: string, rootDir: string) => Promise<void>,
): Promise<void> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "cutover-script-test-"));
  const envPath = path.join(rootDir, "gateway.env");
  await writeFile(
    envPath,
    [
      "UNIFIED_ROUTER_DEFAULT_PRIMARY=eve",
      "UNIFIED_ROUTER_DEFAULT_FALLBACK=hermes",
      "UNIFIED_ROUTER_FAIL_CLOSED=1",
      "UNIFIED_ROUTER_STAGE=shadow",
      "UNIFIED_ROUTER_CANARY_CHAT_IDS=",
      "UNIFIED_ROUTER_MAJORITY_PERCENT=0",
    ].join("\n"),
    "utf8",
  );
  try {
    await run(envPath, rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

describe("cutover scripts", () => {
  it("writes majority stage controls via prod-cutover-stage.sh", async () => {
    await withEnvFile(async (envPath) => {
      const result = await runCommandWithTimeout(
        [
          "bash",
          "scripts/prod-cutover-stage.sh",
          "majority",
          "--canary-chats",
          "100,200",
          "--majority-percent",
          "75",
        ],
        {
          timeoutMs: 8_000,
          env: {
            ...process.env,
            UNIFIED_RUNTIME_ENV_FILE: envPath,
          },
        },
      );
      expect(result.code).toBe(0);
      const content = await readFile(envPath, "utf8");
      expect(content).toContain("UNIFIED_ROUTER_CUTOVER_STAGE=majority");
      expect(content).toContain("UNIFIED_ROUTER_STAGE=majority");
      expect(content).toContain("UNIFIED_ROUTER_DEFAULT_PRIMARY=eve");
      expect(content).toContain("UNIFIED_ROUTER_DEFAULT_FALLBACK=hermes");
      expect(content).toContain("UNIFIED_ROUTER_FAIL_CLOSED=0");
      expect(content).toContain("UNIFIED_ROUTER_CANARY_CHAT_IDS=100,200");
      expect(content).toContain("UNIFIED_ROUTER_MAJORITY_PERCENT=75");
    });
  });

  it("writes rollback-safe lane controls", async () => {
    await withEnvFile(async (envPath) => {
      const stageResult = await runCommandWithTimeout(
        ["bash", "scripts/prod-cutover-stage.sh", "full"],
        {
          timeoutMs: 8_000,
          env: {
            ...process.env,
            UNIFIED_RUNTIME_ENV_FILE: envPath,
          },
        },
      );
      expect(stageResult.code).toBe(0);

      const rollbackResult = await runCommandWithTimeout(
        ["bash", "scripts/prod-rollback-eve-safe-lane.sh"],
        {
          timeoutMs: 8_000,
          env: {
            ...process.env,
            UNIFIED_RUNTIME_ENV_FILE: envPath,
          },
        },
      );
      expect(rollbackResult.code).toBe(0);
      const content = await readFile(envPath, "utf8");
      expect(content).toContain("UNIFIED_ROUTER_CUTOVER_STAGE=shadow");
      expect(content).toContain("UNIFIED_ROUTER_STAGE=shadow");
      expect(content).toContain("UNIFIED_ROUTER_DEFAULT_PRIMARY=eve");
      expect(content).toContain("UNIFIED_ROUTER_DEFAULT_FALLBACK=none");
      expect(content).toContain("UNIFIED_ROUTER_FAIL_CLOSED=1");
      expect(content).toContain("UNIFIED_ROUTER_CANARY_CHAT_IDS=");
      expect(content).toContain("UNIFIED_ROUTER_MAJORITY_PERCENT=0");
    });
  });
});
