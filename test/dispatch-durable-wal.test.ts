import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendDispatchWalLine,
  findOrphanDispatchAttempts,
} from "../src/runtime/dispatch-durable-wal.js";

describe("dispatch durable WAL", () => {
  it("finds orphan attempts missing dispatch_complete", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "dispatch-wal-"));
    const wal = path.join(dir, "wal.jsonl");
    try {
      await appendDispatchWalLine(wal, {
        walVersion: "v1",
        event: "dispatch_attempt",
        attemptId: "a1",
        recordedAtIso: "2026-01-01T00:00:00.000Z",
        channel: "telegram",
        chatId: "1",
        messageId: "m1",
        text: "hello",
      });
      const orphans = await findOrphanDispatchAttempts(wal);
      expect(orphans).toHaveLength(1);
      expect(orphans[0]?.attemptId).toBe("a1");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("excludes attempts closed by dispatch_replay_complete", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "dispatch-wal-"));
    const wal = path.join(dir, "wal.jsonl");
    try {
      await appendDispatchWalLine(wal, {
        walVersion: "v1",
        event: "dispatch_attempt",
        attemptId: "orig",
        recordedAtIso: "2026-01-01T00:00:00.000Z",
        channel: "telegram",
        chatId: "1",
        messageId: "m1",
        text: "hello",
      });
      await appendDispatchWalLine(wal, {
        walVersion: "v1",
        event: "dispatch_replay_complete",
        attemptId: "replay-1",
        originalAttemptId: "orig",
        recordedAtIso: "2026-01-01T00:01:00.000Z",
        traceId: "t1",
        primaryStatus: "pass",
        responseFailureClass: "dispatch_failure",
        laneUsed: "eve",
      });
      const orphans = await findOrphanDispatchAttempts(wal);
      expect(orphans).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("ignores corrupt JSON lines", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "dispatch-wal-"));
    const wal = path.join(dir, "wal.jsonl");
    try {
      await writeFile(wal, "not json\n", "utf8");
      expect(await findOrphanDispatchAttempts(wal)).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
