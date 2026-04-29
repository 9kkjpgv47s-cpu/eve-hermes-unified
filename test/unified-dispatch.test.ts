import { describe, expect, it } from "vitest";
import type { CapabilityExecutionResult, DispatchState, UnifiedCapabilityDecision } from "../src/contracts/types.js";
import { UNIFIED_DISPATCH_CONTRACT_VERSION } from "../src/contracts/schema-version.js";
import { dispatchUnifiedMessage } from "../src/runtime/unified-dispatch.js";
import type { LaneAdapter, LaneDispatchInput } from "../src/adapters/lane-adapter.js";
import type { CapabilityEngine } from "../src/runtime/capability-engine.js";
import type { RouterPolicyConfig } from "../src/router/policy-router.js";

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
    expect(result.contractVersion).toBe(UNIFIED_DISPATCH_CONTRACT_VERSION);
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

  it("skips fallback when primary failureClass matches noFallbackOnFailureClasses", async () => {
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
        traceId: "t1",
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
      routerConfig: baseRouterConfig({
        failClosed: false,
        noFallbackOnFailureClasses: ["policy_failure"],
      }),
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

  it("rejects dispatch when tenantDenylist contains envelope tenantId", async () => {
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
      routerConfig: baseRouterConfig({ failClosed: true }),
      tenantDenylist: ["blocked-org"],
    };

    const result = await dispatchUnifiedMessage(runtime, {
      channel: "telegram",
      chatId: "1",
      messageId: "2",
      text: "hello",
      tenantId: "blocked-org",
    });

    expect(result.primaryState.reason).toBe("tenant_denied_by_dispatch_policy");
    expect(result.routing.reason).toBe("tenant_denied_by_dispatch_policy");
    expect(result.routing.fallbackLane).toBe("none");
    expect(result.response.failureClass).toBe("policy_failure");
  });

  it("rejects dispatch when tenantAllowlist is set and tenantId not listed", async () => {
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
      routerConfig: baseRouterConfig({ failClosed: true }),
      tenantAllowlist: ["org-a"],
    };

    const missing = await dispatchUnifiedMessage(runtime, {
      channel: "telegram",
      chatId: "1",
      messageId: "2",
      text: "hello",
    });
    expect(missing.primaryState.reason).toBe("tenant_not_allowlisted_for_dispatch");

    const wrong = await dispatchUnifiedMessage(runtime, {
      channel: "telegram",
      chatId: "1",
      messageId: "2",
      text: "hello",
      tenantId: "org-b",
    });
    expect(wrong.primaryState.reason).toBe("tenant_not_allowlisted_for_dispatch");

    const ok = await dispatchUnifiedMessage(runtime, {
      channel: "telegram",
      chatId: "1",
      messageId: "2",
      text: "hello",
      tenantId: "org-a",
    });
    expect(ok.primaryState.status).toBe("pass");
  });
});
