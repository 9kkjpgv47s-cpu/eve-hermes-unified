import { describe, expect, it } from "vitest";
import type { CapabilityExecutionResult, DispatchState, UnifiedCapabilityDecision } from "../src/contracts/types.js";
import { dispatchUnifiedMessage } from "../src/runtime/unified-dispatch.js";
import type { LaneAdapter, LaneDispatchInput } from "../src/adapters/lane-adapter.js";
import type { CapabilityEngine } from "../src/runtime/capability-engine.js";
import type { RouterPolicyConfig } from "../src/router/policy-router.js";
import { CapabilityRegistry } from "../src/skills/capability-registry.js";
import { registerDefaultCapabilityExecutors } from "../src/runtime/default-capability-handlers.js";
import { UnifiedCapabilityEngine } from "../src/runtime/capability-engine.js";
import { createCapabilityPolicy } from "../src/runtime/capability-policy.js";
import { InMemoryUnifiedMemoryStore } from "../src/memory/unified-memory-store.js";

class FakeLaneAdapter implements LaneAdapter {
  constructor(
    public laneId: "eve" | "hermes",
    private readonly response: DispatchState,
  ) {}

  async dispatch(_input: LaneDispatchInput): Promise<DispatchState> {
    return this.response;
  }
}

class FakeCapabilityEngine implements CapabilityEngine {
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
  ): Promise<CapabilityExecutionResult> {
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

  it("denies capability when tenant chat denylist blocks chat", async () => {
    const registry = new CapabilityRegistry();
    const memoryStore = new InMemoryUnifiedMemoryStore();
    registerDefaultCapabilityExecutors(registry, {
      dispatchLane: async () => ({
        status: "pass" as const,
        reason: "ok",
        runtimeUsed: "eve",
        runId: "r1",
        elapsedMs: 1,
        failureClass: "none" as const,
        sourceLane: "eve" as const,
        sourceChatId: "1",
        sourceMessageId: "2",
        traceId: "t1",
      }),
      memoryStore,
    });
    const policy = createCapabilityPolicy({
      defaultMode: "allow",
      allowCapabilities: [],
      denyCapabilities: [],
      allowedChatIds: [],
      deniedChatIds: [],
      allowCapabilityChats: {},
      denyCapabilityChats: {},
      allowChatIdsByTenant: {},
      denyChatIdsByTenant: { acme: ["42"] },
    });
    const engine = new UnifiedCapabilityEngine(registry, {
      memoryStore,
      dispatchLane: async () => ({
        status: "pass" as const,
        reason: "ok",
        runtimeUsed: "eve",
        runId: "r1",
        elapsedMs: 1,
        failureClass: "none" as const,
        sourceLane: "eve" as const,
        sourceChatId: "1",
        sourceMessageId: "2",
        traceId: "t1",
      }),
      policy,
    });
    const runtime = {
      eveAdapter: new FakeLaneAdapter("eve", {
        status: "pass",
        reason: "unused",
        runtimeUsed: "eve",
        runId: "r0",
        elapsedMs: 1,
        failureClass: "none",
        sourceLane: "eve",
        sourceChatId: "1",
        sourceMessageId: "2",
        traceId: "t0",
      }),
      hermesAdapter: new FakeLaneAdapter("hermes", {
        status: "pass",
        reason: "unused",
        runtimeUsed: "hermes",
        runId: "r0",
        elapsedMs: 1,
        failureClass: "none",
        sourceLane: "hermes",
        sourceChatId: "1",
        sourceMessageId: "2",
        traceId: "t0",
      }),
      routerConfig: {
        defaultPrimary: "eve" as const,
        defaultFallback: "none" as const,
        failClosed: true,
        policyVersion: "v1",
      },
      capabilityEngine: engine,
    };

    const result = await dispatchUnifiedMessage(runtime, {
      channel: "telegram",
      chatId: "42",
      messageId: "500",
      text: "@cap status",
      tenantId: "acme",
    });

    expect(result.capabilityExecution?.status).toBe("failed");
    expect(result.capabilityExecution?.reason).toBe("chat_denied_by_tenant_policy");
  });

  it("uses hermes primary when envelope region mismatches router region pin", async () => {
    const runtime = {
      eveAdapter: new FakeLaneAdapter("eve", {
        status: "pass",
        reason: "eve_should_not_win",
        runtimeUsed: "eve",
        runId: "r-eve",
        elapsedMs: 1,
        failureClass: "none",
        sourceLane: "eve",
        sourceChatId: "1",
        sourceMessageId: "2",
        traceId: "t-eve",
      }),
      hermesAdapter: new FakeLaneAdapter("hermes", {
        status: "pass",
        reason: "hermes_region_failover",
        runtimeUsed: "hermes",
        runId: "r-hermes",
        elapsedMs: 2,
        failureClass: "none",
        sourceLane: "hermes",
        sourceChatId: "1",
        sourceMessageId: "2",
        traceId: "t-hermes",
      }),
      routerConfig: baseRouterConfig({
        routerRegionId: "us-east",
        defaultPrimary: "eve",
        defaultFallback: "hermes",
      }),
    };

    const result = await dispatchUnifiedMessage(runtime, {
      channel: "telegram",
      chatId: "1",
      messageId: "2",
      text: "hello",
      regionId: "eu-west",
    });

    expect(result.routing.regionAligned).toBe(false);
    expect(result.routing.reason).toBe("region_mismatch_failover_to_fallback_lane");
    expect(result.routing.primaryLane).toBe("hermes");
    expect(result.response.laneUsed).toBe("hermes");
    expect(result.primaryState.sourceLane).toBe("hermes");
  });
});
