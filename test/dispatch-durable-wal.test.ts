import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appendDispatchWalLine, findOrphanDispatchAttempts } from "../src/runtime/dispatch-durable-wal.js";

async function withTempWal(run: (walPath: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "dispatch-wal-test-"));
  const walPath = path.join(dir, "dispatch.wal.jsonl");
  try {
    await run(walPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("findOrphanDispatchAttempts", () => {
  it("returns attempts without dispatch_complete", async () => {
    await withTempWal(async (walPath) => {
      await appendDispatchWalLine(walPath, {
        walVersion: "v1",
        event: "dispatch_attempt",
        attemptId: "a1",
        recordedAtIso: "2026-01-01T00:00:00Z",
        channel: "telegram",
        chatId: "1",
        messageId: "2",
        text: "hello",
      });
      const orphans = await findOrphanDispatchAttempts(walPath);
      expect(orphans).toHaveLength(1);
      expect(orphans[0]?.attemptId).toBe("a1");
    });
  });

  it("excludes attempts closed by dispatch_replay_complete", async () => {
    await withTempWal(async (walPath) => {
      await appendDispatchWalLine(walPath, {
        walVersion: "v1",
        event: "dispatch_attempt",
        attemptId: "a2",
        recordedAtIso: "2026-01-01T00:00:01Z",
        channel: "telegram",
        chatId: "1",
        messageId: "2",
        text: "x",
      });
      await appendDispatchWalLine(walPath, {
        walVersion: "v1",
        event: "dispatch_replay_complete",
        attemptId: "replay-1",
        originalAttemptId: "a2",
        recordedAtIso: "2026-01-01T00:00:02Z",
        traceId: "t1",
        primaryStatus: "pass",
        responseFailureClass: "none",
        laneUsed: "eve",
      });
      const orphans = await findOrphanDispatchAttempts(walPath);
      expect(orphans).toHaveLength(0);
    });
  });

  it("returns empty array for missing file", async () => {
    const orphans = await findOrphanDispatchAttempts("/tmp/does-not-exist-wal-xyz.jsonl");
    expect(orphans).toEqual([]);
  });
});
