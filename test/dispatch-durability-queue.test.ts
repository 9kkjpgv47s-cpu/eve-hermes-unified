import { describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { dispatchUnifiedEnvelope } from "../src/runtime/unified-dispatch.js";
import {
  FileDispatchDurabilityQueue,
  replayPendingDispatches,
} from "../src/runtime/dispatch-durability-queue.js";
import type { DispatchState, UnifiedMessageEnvelope } from "../src/contracts/types.js";
import { UNIFIED_DISPATCH_CONTRACT_VERSION } from "../src/contracts/schema-version.js";
import type { LaneAdapter, LaneDispatchInput } from "../src/adapters/lane-adapter.js";
import type { RouterPolicyConfig } from "../src/router/policy-router.js";

class RecordingLaneAdapter implements LaneAdapter {
  public readonly dispatches: LaneDispatchInput[] = [];

  constructor(
    public laneId: "eve" | "hermes",
    private readonly response: DispatchState,
  ) {}

  async dispatch(input: LaneDispatchInput): Promise<DispatchState> {
    this.dispatches.push(input);
    return this.response;
  }
}

function envelopeFixture(traceId: string): UnifiedMessageEnvelope {
  return {
    traceId,
    channel: "telegram",
    chatId: "1",
    messageId: "2",
    receivedAtIso: new Date().toISOString(),
    text: "replay me",
  };
}

describe("FileDispatchDurabilityQueue", () => {
  it("persists envelopes and replays with stable traceId when primary passes", async () => {
    const queuePath = path.join(os.tmpdir(), `dq-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    const queue = new FileDispatchDurabilityQueue(queuePath);
    const traceId = "fixed-trace-replay";
    await queue.appendEnvelope(envelopeFixture(traceId));

    const eve = new RecordingLaneAdapter(
      "eve",
      {
        status: "pass",
        reason: "ok",
        runtimeUsed: "eve",
        runId: "r1",
        elapsedMs: 1,
        failureClass: "none",
        sourceLane: "eve",
        sourceChatId: "1",
        sourceMessageId: "2",
        traceId,
      },
    );
    const hermes = new RecordingLaneAdapter(
      "hermes",
      {
        status: "pass",
        reason: "ok",
        runtimeUsed: "hermes",
        runId: "r2",
        elapsedMs: 1,
        failureClass: "none",
        sourceLane: "hermes",
        sourceChatId: "1",
        sourceMessageId: "2",
        traceId,
      },
    );

    const routerConfig: RouterPolicyConfig = {
      defaultPrimary: "eve",
      defaultFallback: "hermes",
      failClosed: false,
      policyVersion: "v1",
    };

    const replayed = await replayPendingDispatches(
      { eveAdapter: eve, hermesAdapter: hermes, routerConfig },
      queue,
    );

    expect(replayed).toHaveLength(1);
    expect(replayed[0].result.contractVersion).toBe(UNIFIED_DISPATCH_CONTRACT_VERSION);
    expect(replayed[0].result.envelope.traceId).toBe(traceId);
    expect(replayed[0].result.primaryState.traceId).toBe(traceId);
    expect(eve.dispatches).toHaveLength(1);
    expect(eve.dispatches[0].envelope.traceId).toBe(traceId);

    const pending = await queue.listPending();
    expect(pending).toHaveLength(0);
  });
});

describe("dispatchUnifiedEnvelope", () => {
  it("preserves traceId from supplied envelope", async () => {
    const traceId = "external-correlation-id";
    const eve = new RecordingLaneAdapter(
      "eve",
      {
        status: "pass",
        reason: "ok",
        runtimeUsed: "eve",
        runId: "r1",
        elapsedMs: 1,
        failureClass: "none",
        sourceLane: "eve",
        sourceChatId: "1",
        sourceMessageId: "2",
        traceId,
      },
    );
    const hermes = new RecordingLaneAdapter(
      "hermes",
      {
        status: "pass",
        reason: "ok",
        runtimeUsed: "hermes",
        runId: "r2",
        elapsedMs: 1,
        failureClass: "none",
        sourceLane: "hermes",
        sourceChatId: "1",
        sourceMessageId: "2",
        traceId,
      },
    );

    const runtime = {
      eveAdapter: eve,
      hermesAdapter: hermes,
      routerConfig: {
        defaultPrimary: "eve" as const,
        defaultFallback: "hermes" as const,
        failClosed: false,
        policyVersion: "v1",
      },
    };

    const result = await dispatchUnifiedEnvelope(runtime, envelopeFixture(traceId));
    expect(result.envelope.traceId).toBe(traceId);
    expect(result.response.traceId).toBe(traceId);
  });
});
