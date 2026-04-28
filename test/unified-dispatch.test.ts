import { describe, expect, it } from "vitest";
import type { CapabilityExecutionResult, DispatchState, UnifiedCapabilityDecision } from "../src/contracts/types.js";
import { dispatchUnifiedMessage } from "../src/runtime/unified-dispatch.js";
import type { LaneAdapter, LaneDispatchInput } from "../src/adapters/lane-adapter.js";
import type { CapabilityEngine } from "../src/runtime/capability-engine.js";
import type { RouterPolicyConfig } from "../src/router/policy-router.js";
import { InMemoryUnifiedMemoryStore } from "../src/memory/unified-memory-store.js";
import { TenantScopedMemoryStore } from "../src/memory/tenant-scoped-memory-store.js";
import { CapabilityRegistry, type CapabilityLaneDispatchInput } from "../src/skills/capability-registry.js";
import { UnifiedCapabilityEngine } from "../src/runtime/capability-engine.js";
import { registerDefaultCapabilityExecutors } from "../src/runtime/default-capability-handlers.js";

class FakeLaneAdapter implements LaneAdapter {
  lastSignal: AbortSignal | undefined;
  lastEnvelope: import("../src/contracts/types.js").UnifiedMessageEnvelope | undefined;

  constructor(
    public laneId: "eve" | "hermes",
    private readonly response: DispatchState,
  ) {}

  async dispatch(input: LaneDispatchInput): Promise<DispatchState> {
    this.lastSignal = input.signal;
    this.lastEnvelope = input.envelope;
    return this.response;
  }
}

class FakeCapabilityEngine implements CapabilityEngine {
  lastMemoryStore: unknown;

  constructor(
    private readonly decision?: UnifiedCapabilityDecision,
    private readonly execution?: CapabilityExecutionResult,
  ) {}

  select(): UnifiedCapabilityDecision | undefined {
    return this.decision;
  }

  async execute(
    _selection: UnifiedCapabilityDecision,
    _envelope: { traceId: string },
    options?: { memoryStore?: unknown },
  ): Promise<CapabilityExecutionResult> {
    this.lastMemoryStore = options?.memoryStore;
    if (!this.execution) {
      throw new Error("Execution was not configured.");
    }
    return this.execution;
  }
}

function baseRouterConfig(overrides?: Partial<RouterPolicyConfig>): RouterPolicyConfig {
  return {
    defaultPrimary: "eve",
    defaultFallback: "hermes",
    failClosed: false,
    policyVersion: "v1",
    ...overrides,
  };
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
      routerConfig: baseRouterConfig(),
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
      routerConfig: baseRouterConfig(),
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
    expect(result.fallbackInfo?.attempted).toBe(true);
    expect(result.fallbackInfo?.reason).toBe("primary_failed");
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
      routerConfig: baseRouterConfig({ failClosed: true }),
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
    expect(result.fallbackInfo).toBeUndefined();
  });

  it("uses capability engine path when explicit capability command resolves", async () => {
    const runtime = {
      eveAdapter: new FakeLaneAdapter("eve", {
        status: "failed",
        reason: "unused",
        runtimeUsed: "eve",
        runId: "r1",
        elapsedMs: 1,
        failureClass: "dispatch_failure",
        sourceLane: "eve",
        sourceChatId: "1",
        sourceMessageId: "2",
        traceId: "t1",
      }),
      hermesAdapter: new FakeLaneAdapter("hermes", {
        status: "failed",
        reason: "unused",
        runtimeUsed: "hermes",
        runId: "r2",
        elapsedMs: 1,
        failureClass: "dispatch_failure",
        sourceLane: "hermes",
        sourceChatId: "1",
        sourceMessageId: "2",
        traceId: "t2",
      }),
      routerConfig: baseRouterConfig(),
      capabilityEngine: new FakeCapabilityEngine(
        {
          id: "summarize_state",
          lane: "hermes",
          routeReason: "explicit_capability_command",
        },
        {
          capability: {
            id: "summarize_state",
            lane: "hermes",
            routeReason: "explicit_capability_command",
          },
          status: "pass",
          consumed: true,
          reason: "capability_summarize_state_success",
          outputText: "Capability summarize_state executed (Hermes owner).",
          failureClass: "none",
          runId: "cap-1",
          elapsedMs: 3,
        },
      ),
    };

    const result = await dispatchUnifiedMessage(runtime, {
      channel: "telegram",
      chatId: "1",
      messageId: "2",
      text: "@cap summarize_state",
    });

    expect(result.capabilityDecision?.id).toBe("summarize_state");
    expect(result.capabilityExecution?.status).toBe("pass");
    expect(result.routing.reason).toBe("explicit_capability_command");
    expect(result.response.laneUsed).toBe("hermes");
    expect(result.response.failureClass).toBe("none");
  });

  it("passes abortSignal to lane adapters for cooperative cancel", async () => {
    const ac = new AbortController();
    const eve = new FakeLaneAdapter("eve", {
      status: "pass",
      reason: "ok",
      runtimeUsed: "eve",
      runId: "r1",
      elapsedMs: 1,
      failureClass: "none",
      sourceLane: "eve",
      sourceChatId: "1",
      sourceMessageId: "2",
      traceId: "t1",
    });
    const hermes = new FakeLaneAdapter("hermes", {
      status: "pass",
      reason: "ok",
      runtimeUsed: "hermes",
      runId: "r2",
      elapsedMs: 1,
      failureClass: "none",
      sourceLane: "hermes",
      sourceChatId: "1",
      sourceMessageId: "2",
      traceId: "t2",
    });
    const runtime = {
      eveAdapter: eve,
      hermesAdapter: hermes,
      routerConfig: baseRouterConfig(),
      abortSignal: ac.signal,
    };

    await dispatchUnifiedMessage(runtime, {
      channel: "telegram",
      chatId: "1",
      messageId: "2",
      text: "hello",
    });

    expect(eve.lastSignal).toBe(ac.signal);
    expect(hermes.lastSignal).toBeUndefined();
  });

  it("fails closed when tenantStrict and tenant id missing", async () => {
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
        traceId: "t1",
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
        traceId: "t2",
      }),
      routerConfig: baseRouterConfig(),
      tenantStrict: true,
    };

    const result = await dispatchUnifiedMessage(runtime, {
      channel: "telegram",
      chatId: "1",
      messageId: "2",
      text: "hello",
    });

    expect(result.primaryState.reason).toBe("tenant_id_required");
    expect(result.response.failureClass).toBe("policy_failure");
    expect(result.routing.reason).toBe("tenant_gate");
  });

  it("fails closed when tenant not in allowlist", async () => {
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
        traceId: "t1",
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
        traceId: "t2",
      }),
      routerConfig: baseRouterConfig(),
      tenantAllowlist: ["acme"],
    };

    const blocked = await dispatchUnifiedMessage(runtime, {
      channel: "telegram",
      chatId: "1",
      messageId: "2",
      text: "hello",
      tenantId: "other",
    });
    expect(blocked.primaryState.reason).toBe("tenant_id_not_allowed");

    const allowed = await dispatchUnifiedMessage(runtime, {
      channel: "telegram",
      chatId: "1",
      messageId: "2",
      text: "hello",
      tenantId: "acme",
    });
    expect(allowed.response.failureClass).toBe("none");
  });

  it("fails closed when tenant memory isolation requires tenant", async () => {
    const shared = new InMemoryUnifiedMemoryStore();
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
        traceId: "t1",
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
        traceId: "t2",
      }),
      routerConfig: baseRouterConfig(),
      memoryStore: shared,
      tenantMemoryIsolation: true,
    };

    const result = await dispatchUnifiedMessage(runtime, {
      channel: "telegram",
      chatId: "1",
      messageId: "2",
      text: "hello",
    });
    expect(result.primaryState.reason).toBe("tenant_id_required_for_memory_isolation");
  });

  it("propagates envelope tenant to lane dispatch inside capabilities", async () => {
    const shared = new InMemoryUnifiedMemoryStore();
    const registry = new CapabilityRegistry();
    let lastLaneEnvelope: import("../src/contracts/types.js").UnifiedMessageEnvelope | undefined;
    const dispatchLane = async (input: CapabilityLaneDispatchInput) => {
      lastLaneEnvelope = input.envelope;
      return {
        status: "pass" as const,
        reason: "ok",
        runtimeUsed: "eve",
        runId: "lane-1",
        elapsedMs: 1,
        failureClass: "none" as const,
        sourceLane: "eve" as const,
        sourceChatId: "1",
        sourceMessageId: "2",
        traceId: input.envelope.traceId,
      };
    };
    registerDefaultCapabilityExecutors(registry, { dispatchLane, memoryStore: shared });
    const engine = new UnifiedCapabilityEngine(registry, {
      memoryStore: shared,
      dispatchLane,
    });

    const eve = new FakeLaneAdapter("eve", {
      status: "pass",
      reason: "ok",
      runtimeUsed: "eve",
      runId: "r1",
      elapsedMs: 1,
      failureClass: "none",
      sourceLane: "eve",
      sourceChatId: "1",
      sourceMessageId: "2",
      traceId: "t1",
    });
    const hermes = new FakeLaneAdapter("hermes", {
      status: "pass",
      reason: "ok",
      runtimeUsed: "hermes",
      runId: "r2",
      elapsedMs: 1,
      failureClass: "none",
      sourceLane: "hermes",
      sourceChatId: "1",
      sourceMessageId: "2",
      traceId: "t2",
    });

    await dispatchUnifiedMessage(
      {
        eveAdapter: eve,
        hermesAdapter: hermes,
        routerConfig: baseRouterConfig(),
        capabilityEngine: engine,
        memoryStore: shared,
      },
      {
        channel: "telegram",
        chatId: "1",
        messageId: "2",
        text: "@cap check_status",
        tenantId: "acme",
      },
    );

    expect(lastLaneEnvelope?.tenantId).toBe("acme");
  });

  it("passes tenant-scoped memory store to capability execute", async () => {
    const shared = new InMemoryUnifiedMemoryStore();
    const fakeCap = new FakeCapabilityEngine(
      {
        id: "x",
        lane: "eve",
        routeReason: "explicit_capability_command",
      },
      {
        capability: { id: "x", lane: "eve", routeReason: "explicit_capability_command" },
        status: "pass",
        consumed: true,
        reason: "capability_x_success",
        outputText: "ok",
        failureClass: "none",
        runId: "c1",
        elapsedMs: 1,
      },
    );
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
        traceId: "t1",
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
        traceId: "t2",
      }),
      routerConfig: baseRouterConfig(),
      capabilityEngine: fakeCap,
      memoryStore: shared,
    };

    await dispatchUnifiedMessage(runtime, {
      channel: "telegram",
      chatId: "1",
      messageId: "2",
      text: "@cap x",
      tenantId: "acme",
    });

    expect(fakeCap.lastMemoryStore).toBeInstanceOf(TenantScopedMemoryStore);
  });
});
