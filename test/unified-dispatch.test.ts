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
  });

  it("does not fall back when failClosed=true even if primary fails", async () => {
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
        reason: "should_not_run",
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
    expect(result.response.failureClass).toBe("dispatch_failure");
  });

  it("does not fall back when fallbackLane is none", async () => {
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
        reason: "should_not_run",
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
        defaultFallback: "none" as const,
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
    expect(result.response.failureClass).toBe("dispatch_failure");
  });

  it("routes @cursor through eve as primary", async () => {
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
        traceId: "t-eve",
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
        traceId: "t-hermes",
      }),
      routerConfig: {
        defaultPrimary: "hermes" as const,
        defaultFallback: "eve" as const,
        failClosed: false,
        policyVersion: "v1",
      },
    };

    const result = await dispatchUnifiedMessage(runtime, {
      channel: "telegram",
      chatId: "1",
      messageId: "2",
      text: "@cursor do work",
    });

    expect(result.decision).toBe("explicit_cursor_passthrough");
    expect(result.response.laneUsed).toBe("eve");
  });

  it("routes @hermes through hermes as primary", async () => {
    const runtime = {
      eveAdapter: new FakeLaneAdapter("eve", {
        status: "pass",
        reason: "should_not_run",
        runtimeUsed: "eve",
        runId: "r1",
        elapsedMs: 1,
        failureClass: "none",
        sourceLane: "eve",
        sourceChatId: "1",
        sourceMessageId: "2",
        traceId: "t-eve",
      }),
      hermesAdapter: new FakeLaneAdapter("hermes", {
        status: "pass",
        reason: "ok",
        runtimeUsed: "hermes",
        runId: "r2",
        elapsedMs: 1,
        failureClass: "none",
        sourceLane: "hermes",
        sourceChatId: "1",
        sourceMessageId: "2",
        traceId: "t-hermes",
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
      text: "@hermes summarize",
    });

    expect(result.decision).toBe("explicit_hermes_passthrough");
    expect(result.response.laneUsed).toBe("hermes");
  });

  it("uses envelope traceId on unified response when lane state traceId is blank", async () => {
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
        traceId: "   ",
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

    expect(result.response.traceId).toBe(result.envelope.traceId);
  });

  it("passes memory snapshot and lane capability ids to primary dispatch", async () => {
    let primaryInput: LaneDispatchInput | undefined;
    class CapturingEve implements LaneAdapter {
      laneId: "eve" = "eve";
      async dispatch(input: LaneDispatchInput): Promise<DispatchState> {
        primaryInput = input;
        return {
          status: "pass",
          reason: "ok",
          runtimeUsed: "eve",
          runId: "r1",
          elapsedMs: 1,
          failureClass: "none",
          sourceLane: "eve",
          sourceChatId: input.envelope.chatId,
          sourceMessageId: input.envelope.messageId,
          traceId: input.envelope.traceId,
        };
      }
    }

    const { CapabilityRegistry, defaultCapabilityCatalog } = await import(
      "../src/capabilities/capability-registry.js"
    );
    const { InMemoryUnifiedMemoryStore } = await import("../src/memory/unified-memory-store.js");

    const memory = new InMemoryUnifiedMemoryStore();
    memory.setChatKey("9", "ctx", "x");

    const caps = new CapabilityRegistry();
    caps.registerAll(defaultCapabilityCatalog);

    const runtime = {
      eveAdapter: new CapturingEve(),
      hermesAdapter: new FakeLaneAdapter("hermes", {
        status: "pass",
        reason: "unused",
        runtimeUsed: "hermes",
        runId: "r2",
        elapsedMs: 1,
        failureClass: "none",
        sourceLane: "hermes",
        sourceChatId: "9",
        sourceMessageId: "2",
        traceId: "t2",
      }),
      routerConfig: {
        defaultPrimary: "eve" as const,
        defaultFallback: "hermes" as const,
        failClosed: false,
        policyVersion: "v1",
      },
      memoryStore: memory,
      capabilityRegistry: caps,
    };

    await dispatchUnifiedMessage(runtime, {
      channel: "telegram",
      chatId: "9",
      messageId: "2",
      text: "hello",
    });

    expect(primaryInput?.memorySnapshot?.ctx).toBe("x");
    expect(primaryInput?.capabilityIds).toEqual(["eve.dispatch_script"]);
    const events = memory.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.lane).toBe("eve");
    expect(events[0]?.phase).toBe("primary");
  });
});
