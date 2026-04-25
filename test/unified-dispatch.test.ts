import { describe, expect, it } from "vitest";
import type { DispatchState } from "../src/contracts/types.js";
import { dispatchUnifiedMessage } from "../src/runtime/unified-dispatch.js";
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

describe("dispatchUnifiedMessage", () => {
  it("uses primary lane when successful", async () => {
    const runtime = {
      eveAdapter: new FakeLaneAdapter("eve", {
        status: "pass",
        reason: "ok",
        runtimeUsed: "eve",
        runId: "r1",
        elapsedMs: 12,
        failureClass: "none",
        sourceLane: "eve",
        sourceChatId: "1",
        sourceMessageId: "2",
        traceId: "t1",
      }),
      hermesAdapter: new FakeLaneAdapter("hermes", {
        status: "pass",
        reason: "ok",
        runtimeUsed: "hermes",
        runId: "r2",
        elapsedMs: 10,
        failureClass: "none",
        sourceLane: "hermes",
        sourceChatId: "1",
        sourceMessageId: "2",
        traceId: "t2",
      }),
      routerConfig: {
        defaultPrimary: "eve" as const,
        defaultFallback: "hermes" as const,
        failClosed: false,
        policyVersion: "v1",
      },
    };

    const result = await dispatchUnifiedMessage(runtime, {
      channel: "telegram",
      chatId: "1",
      messageId: "2",
      text: "hello",
    });

    expect(result.response.laneUsed).toBe("eve");
    expect(result.response.failureClass).toBe("none");
    expect(result.routing.reason).toBe("default_policy_lane");
    expect(result.primaryState.traceId).toBe(result.envelope.traceId);
    expect(result.response.traceId).toBe(result.envelope.traceId);
    expect(result.fallbackState).toBeUndefined();
  });

  it("falls back when primary fails and failClosed=false", async () => {
    const runtime = {
      eveAdapter: new FakeLaneAdapter("eve", {
        status: "failed",
        reason: "primary_failed",
        runtimeUsed: "eve",
        runId: "r1",
        elapsedMs: 12,
        failureClass: "dispatch_failure",
        sourceLane: "eve",
        sourceChatId: "1",
        sourceMessageId: "2",
        traceId: "t1",
      }),
      hermesAdapter: new FakeLaneAdapter("hermes", {
        status: "pass",
        reason: "fallback_ok",
        runtimeUsed: "hermes",
        runId: "r2",
        elapsedMs: 10,
        failureClass: "none",
        sourceLane: "hermes",
        sourceChatId: "1",
        sourceMessageId: "2",
        traceId: "t2",
      }),
      routerConfig: {
        defaultPrimary: "eve" as const,
        defaultFallback: "hermes" as const,
        failClosed: false,
        policyVersion: "v1",
      },
    };

    const result = await dispatchUnifiedMessage(runtime, {
      channel: "telegram",
      chatId: "1",
      messageId: "2",
      text: "hello",
    });

    expect(result.response.laneUsed).toBe("hermes");
    expect(result.primaryState.sourceLane).toBe("eve");
    expect(result.fallbackState?.sourceLane).toBe("hermes");
    expect(result.fallbackState?.traceId).toBe(result.envelope.traceId);
  });

  it("stops on primary failure when failClosed=true", async () => {
    const runtime = {
      eveAdapter: new FakeLaneAdapter("eve", {
        status: "failed",
        reason: "policy_blocked",
        runtimeUsed: "eve",
        runId: "r1",
        elapsedMs: 5,
        failureClass: "policy_failure",
        sourceLane: "eve",
        sourceChatId: "1",
        sourceMessageId: "2",
        traceId: "external-trace",
      }),
      hermesAdapter: new FakeLaneAdapter("hermes", {
        status: "pass",
        reason: "should_not_run",
        runtimeUsed: "hermes",
        runId: "r2",
        elapsedMs: 1,
        failureClass: "none",
        sourceLane: "hermes",
        sourceChatId: "1",
        sourceMessageId: "2",
        traceId: "t2",
      }),
      routerConfig: {
        defaultPrimary: "eve" as const,
        defaultFallback: "hermes" as const,
        failClosed: true,
        policyVersion: "v1",
      },
    };

    const result = await dispatchUnifiedMessage(runtime, {
      channel: "telegram",
      chatId: "1",
      messageId: "2",
      text: "hello",
    });

    expect(result.response.laneUsed).toBe("eve");
    expect(result.response.failureClass).toBe("policy_failure");
    expect(result.fallbackState).toBeUndefined();
    expect(result.primaryState.traceId).toBe(result.envelope.traceId);
  });
});
