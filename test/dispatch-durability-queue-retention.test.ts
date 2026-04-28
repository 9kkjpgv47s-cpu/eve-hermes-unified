import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  FileDispatchDurabilityQueue,
  pruneCompletedDispatchQueueEntries,
} from "../src/runtime/dispatch-durability-queue.js";

describe("pruneCompletedDispatchQueueEntries", () => {
  it("does nothing when max is 0", () => {
    const queue = {
      version: 1 as const,
      entries: [
        {
          id: "a",
          enqueuedAtIso: "2020-01-01T00:00:00.000Z",
          attempts: 0,
          status: "dispatched" as const,
          envelope: {
            channel: "telegram" as const,
            chatId: "1",
            messageId: "1",
            text: "x",
            traceId: "t-a",
            receivedAtIso: "2020-01-01T00:00:00.000Z",
          },
        },
      ],
    };
    const { pruned } = pruneCompletedDispatchQueueEntries(queue, 0);
    expect(pruned).toBe(0);
    expect(queue.entries).toHaveLength(1);
  });

  it("drops oldest dispatched/failed entries beyond the cap, never pending", () => {
    const mk = (
      id: string,
      iso: string,
      status: "pending" | "dispatched" | "failed",
    ) => ({
      id,
      enqueuedAtIso: iso,
      attempts: 0,
      status,
      envelope: {
        channel: "telegram" as const,
        chatId: "1",
        messageId: id,
        text: "x",
        traceId: `t-${id}`,
        receivedAtIso: iso,
      },
    });
    const queue = {
      version: 1 as const,
      entries: [
        mk("old-d", "2020-01-01T00:00:00.000Z", "dispatched"),
        mk("mid-d", "2020-01-02T00:00:00.000Z", "dispatched"),
        mk("new-d", "2020-01-03T00:00:00.000Z", "dispatched"),
        mk("pend", "2020-01-01T00:00:00.000Z", "pending"),
      ],
    };
    const { pruned } = pruneCompletedDispatchQueueEntries(queue, 2);
    expect(pruned).toBe(1);
    const ids = queue.entries.map((e) => e.id).sort();
    expect(ids).toEqual(["mid-d", "new-d", "pend"]);
  });
});

describe("FileDispatchDurabilityQueue retention", () => {
  it("prunes old terminal entries after markDispatched when retention cap is set", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "dq-ret-"));
    const filePath = path.join(dir, "queue.json");
    await writeFile(
      filePath,
      `${JSON.stringify({
        version: 1,
        entries: [
          {
            id: "keep-old",
            enqueuedAtIso: "2020-01-01T00:00:00.000Z",
            attempts: 0,
            status: "dispatched",
            envelope: {
              channel: "telegram",
              chatId: "1",
              messageId: "a",
              text: "x",
              traceId: "t1",
              receivedAtIso: "2020-01-01T00:00:00.000Z",
            },
          },
        ],
      })}\n`,
      "utf8",
    );

    const queue = new FileDispatchDurabilityQueue(filePath, 1);
    await queue.appendEnvelope({
      channel: "telegram",
      chatId: "1",
      messageId: "b",
      text: "replay",
      traceId: "t2",
      receivedAtIso: new Date().toISOString(),
    });
    const pending = await queue.listPending();
    expect(pending).toHaveLength(1);
    await queue.markDispatched(pending[0].id);

    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as { entries: { id: string }[] };
    const ids = parsed.entries.map((e) => e.id);
    expect(ids).not.toContain("keep-old");
    expect(ids.length).toBe(1);

    await rm(dir, { recursive: true, force: true });
  });
});
