import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "reconcile-dq-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("reconcile-dispatch-queue.mjs", () => {
  it("passes when every accepted has a finished", async () => {
    await withTempDir(async (dir) => {
      const journalPath = path.join(dir, "q.jsonl");
      const routing = {
        primaryLane: "eve",
        fallbackLane: "hermes",
        reason: "default_policy_lane",
        policyVersion: "v1",
        failClosed: false,
      };
      const lines = [
        {
          auditSchemaVersion: 1,
          eventType: "dispatch_queue_accepted",
          recordedAtIso: new Date().toISOString(),
          traceId: "t-a",
          chatId: "1",
          messageId: "2",
          tenantId: null,
          dispatchPath: "lane",
          routing,
        },
        {
          auditSchemaVersion: 1,
          eventType: "dispatch_queue_finished",
          recordedAtIso: new Date().toISOString(),
          traceId: "t-a",
          chatId: "1",
          messageId: "2",
          tenantId: null,
          responseLaneUsed: "eve",
          responseFailureClass: "none",
          primaryLane: "eve",
          primaryStatus: "pass",
          fallbackAttempted: false,
          capabilityConsumed: false,
        },
      ];
      await writeFile(journalPath, lines.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf8");
      const result = await runCommandWithTimeout(
        ["node", "scripts/reconcile-dispatch-queue.mjs", "--file", journalPath],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as { pass: boolean; checks: { orphanAcceptedCount: number } };
      expect(payload.pass).toBe(true);
      expect(payload.checks.orphanAcceptedCount).toBe(0);
    });
  });

  it("fails when accepted has no finished", async () => {
    await withTempDir(async (dir) => {
      const journalPath = path.join(dir, "q.jsonl");
      const routing = {
        primaryLane: "eve",
        fallbackLane: "hermes",
        reason: "default_policy_lane",
        policyVersion: "v1",
        failClosed: false,
      };
      await writeFile(
        journalPath,
        `${JSON.stringify({
          auditSchemaVersion: 1,
          eventType: "dispatch_queue_accepted",
          recordedAtIso: new Date().toISOString(),
          traceId: "t-orphan",
          chatId: "1",
          messageId: "2",
          tenantId: null,
          dispatchPath: "lane",
          routing,
        })}\n`,
        "utf8",
      );
      const result = await runCommandWithTimeout(
        ["node", "scripts/reconcile-dispatch-queue.mjs", "--file", journalPath],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(2);
      const payload = JSON.parse(result.stdout) as { pass: boolean; checks: { orphanAcceptedCount: number } };
      expect(payload.pass).toBe(false);
      expect(payload.checks.orphanAcceptedCount).toBe(1);
      expect(result.stderr).toContain("orphanAccepted=1");
    });
  });
});
