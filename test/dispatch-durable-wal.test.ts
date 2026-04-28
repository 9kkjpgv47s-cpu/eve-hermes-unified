import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findOrphanDispatchAttempts } from "../src/runtime/dispatch-durable-wal.js";

describe("findOrphanDispatchAttempts", () => {
  it("returns attempts without matching complete", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "dispatch-wal-test-"));
    try {
      const wal = path.join(dir, "wal.jsonl");
      await writeFile(
        wal,
        [
          JSON.stringify({
            walVersion: "v1",
            event: "dispatch_attempt",
            attemptId: "a1",
            recordedAtIso: "2026-01-01T00:00:00.000Z",
            channel: "telegram",
            chatId: "1",
            messageId: "1",
            text: "hello",
          }),
          JSON.stringify({
            walVersion: "v1",
            event: "dispatch_complete",
            attemptId: "a2",
            recordedAtIso: "2026-01-01T00:00:01.000Z",
            traceId: "t2",
            primaryStatus: "pass",
            responseFailureClass: "none",
            laneUsed: "eve",
          }),
          "",
        ].join("\n"),
        "utf8",
      );
      const orphans = await findOrphanDispatchAttempts(wal);
      expect(orphans).toHaveLength(1);
      expect(orphans[0]?.attemptId).toBe("a1");
      expect(orphans[0]?.text).toBe("hello");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("treats dispatch_replay_complete as resolving the original attempt", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "dispatch-wal-replay-test-"));
    try {
      const wal = path.join(dir, "wal.jsonl");
      await writeFile(
        wal,
        [
          JSON.stringify({
            walVersion: "v1",
            event: "dispatch_attempt",
            attemptId: "orphan-1",
            recordedAtIso: "2026-01-01T00:00:00.000Z",
            channel: "telegram",
            chatId: "9",
            messageId: "9",
            text: "replay me",
          }),
          JSON.stringify({
            walVersion: "v1",
            event: "dispatch_replay_complete",
            originalAttemptId: "orphan-1",
            recordedAtIso: "2026-01-01T00:00:02.000Z",
            traceId: "t-replay",
            primaryStatus: "pass",
            responseFailureClass: "none",
            laneUsed: "eve",
          }),
          "",
        ].join("\n"),
        "utf8",
      );
      const orphans = await findOrphanDispatchAttempts(wal);
      expect(orphans).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
