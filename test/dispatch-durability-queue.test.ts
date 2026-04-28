import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DispatchState } from "../src/contracts/types.js";
import {
  FileDispatchDurabilityQueue,
  replayPendingDispatches,
} from "../src/runtime/dispatch-durability-queue.js";
import { dispatchUnifiedEnvelope } from "../src/runtime/unified-dispatch.js";
import type { LaneAdapter, LaneDispatchInput } from "../src/adapters/lane-adapter.js";

class FakeLaneAdapter implements LaneAdapter {
  constructor(
    public laneId: "eve" | "hermes",
    private readonly response: DispatchState,
  ) {}

  async dispatch(_input: LaneDispatchInput): Promise<DispatchState> {
    return this.response;
  }
}

describe("FileDispatchDurabilityQueue", () => {
  it("persists pending envelopes and replays through dispatchUnifiedEnvelope", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "dq-test-"));
    try {
      const queuePath = path.join(dir, "queue.json");
      const queue = new FileDispatchDurabilityQueue(queuePath);

      await queue.appendEnvelope({
        traceId: "trace-replay-1",
        channel: "telegram",
        chatId: "1",
        messageId: "2",
        receivedAtIso: new Date().toISOString(),
        text: "hello replay",
      });

      const pending = await queue.listPending();
      expect(pending).toHaveLength(1);

      const runtime = {
        eveAdapter: new FakeLaneAdapter("eve", {
          status: "pass",
          reason: "ok",
          runtimeUsed: "eve",
          runId: "r1",
          elapsedMs: 1,
          failureClass: "none",
          sourceLane: "eve",
          sourceChatId: "1",
          sourceMessageId: "2",
          traceId: "trace-replay-1",
        }),
        hermesAdapter: new FakeLaneAdapter("hermes", {
          status: "pass",
          reason: "unused",
          runtimeUsed: "hermes",
          runId: "r2",
          elapsedMs: 1,
          failureClass: "none",
          sourceLane: "hermes",
          sourceChatId: "1",
          sourceMessageId: "2",
          traceId: "trace-replay-1",
        }),
        routerConfig: {
          defaultPrimary: "eve" as const,
          defaultFallback: "hermes" as const,
          failClosed: true,
          policyVersion: "v1",
        },
      };

      const replay = await replayPendingDispatches(queue, runtime);
      expect(replay.results).toHaveLength(1);
      expect(replay.results[0]?.response.failureClass).toBe("none");

      const after = await queue.listPending();
      expect(after).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("dispatchUnifiedEnvelope preserves trace ids from queued envelopes", async () => {
    const runtime = {
      eveAdapter: new FakeLaneAdapter("eve", {
        status: "failed",
        reason: "boom",
        runtimeUsed: "eve",
        runId: "r1",
        elapsedMs: 1,
        failureClass: "dispatch_failure",
        sourceLane: "eve",
        sourceChatId: "9",
        sourceMessageId: "9",
        traceId: "fixed-trace",
      }),
      hermesAdapter: new FakeLaneAdapter("hermes", {
        status: "pass",
        reason: "fb",
        runtimeUsed: "hermes",
        runId: "r2",
        elapsedMs: 1,
        failureClass: "none",
        sourceLane: "hermes",
        sourceChatId: "9",
        sourceMessageId: "9",
        traceId: "fixed-trace",
      }),
      routerConfig: {
        defaultPrimary: "eve" as const,
        defaultFallback: "hermes" as const,
        failClosed: false,
        policyVersion: "v1",
      },
    };

    const result = await dispatchUnifiedEnvelope(runtime, {
      traceId: "fixed-trace",
      channel: "telegram",
      chatId: "9",
      messageId: "9",
      receivedAtIso: new Date().toISOString(),
      text: "replay body",
    });

    expect(result.envelope.traceId).toBe("fixed-trace");
    expect(result.primaryState.traceId).toBe("fixed-trace");
  });
});
