import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "verify-cutover-readiness-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("verify-cutover-readiness.sh", () => {
  it("verifies all stages and rollback produce expected env keys", { timeout: 60_000 }, async () => {
    await withTempDir(async (dir) => {
      const envPath = path.join(dir, "gateway.env");
      const outPath = path.join(dir, "cutover-readiness.json");
      await writeFile(
        envPath,
        [
          "UNIFIED_ROUTER_DEFAULT_PRIMARY=eve",
          "UNIFIED_ROUTER_DEFAULT_FALLBACK=hermes",
          "UNIFIED_ROUTER_FAIL_CLOSED=1",
          "UNIFIED_ROUTER_CUTOVER_STAGE=shadow",
          "UNIFIED_ROUTER_STAGE=shadow",
          "UNIFIED_ROUTER_CANARY_CHAT_IDS=",
          "UNIFIED_ROUTER_MAJORITY_PERCENT=0",
        ].join("\n"),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        ["bash", "scripts/verify-cutover-readiness.sh"],
        {
          timeoutMs: 12_000,
          env: {
            ...process.env,
            UNIFIED_RUNTIME_ENV_FILE: envPath,
            UNIFIED_CUTOVER_CANARY_CHATS: "100,200",
            UNIFIED_CUTOVER_MAJORITY_PERCENT: "70",
            UNIFIED_CUTOVER_READINESS_REPORT_PATH: outPath,
          },
        },
      );
      expect(result.code).toBe(0);

      const report = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        stageRecords: Array<{ stage: string; pass: boolean }>;
        rollback: { pass: boolean };
      };
      expect(report.pass).toBe(true);
      expect(report.stageRecords.length).toBe(6);
      expect(report.stageRecords.every((record) => record.pass)).toBe(true);
      expect(report.rollback.pass).toBe(true);
    });
  });
});
