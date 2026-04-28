import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DispatchState } from "../src/contracts/types.js";
import type { CapabilityExecutionResult } from "../src/skills/capability-registry.js";
import { dispatchUnifiedMessage } from "../src/runtime/unified-dispatch.js";
import { CapabilityRegistry } from "../src/skills/capability-registry.js";
import { UnifiedCapabilityEngine } from "../src/runtime/capability-engine.js";
import { FileUnifiedMemoryStore } from "../src/memory/unified-memory-store.js";
import type { LaneAdapter, LaneDispatchInput } from "../src/adapters/lane-adapter.js";
import { registerDefaultCapabilityExecutors } from "../src/runtime/default-capability-handlers.js";
import {
  buildCapabilityPolicyFromConfig,
  createCapabilityPolicy,
  type CapabilityPolicyConfig,
} from "../src/runtime/capability-policy.js";
import { appendCapabilityPolicyDenialAudit } from "../src/runtime/capability-policy-audit.js";

class FakeLaneAdapter implements LaneAdapter {
  constructor(
    public laneId: "eve" | "hermes",
    private readonly response: DispatchState,
  ) {}

  async dispatch(_input: LaneDispatchInput): Promise<DispatchState> {
    return this.response;
  }
}

function buildCapabilityResult(outputText: string): CapabilityExecutionResult {
  return {
    consumed: true,
    responseText: outputText,
  };
}

function fakeLaneState(lane: "eve" | "hermes", reason = "ok"): DispatchState {
  return {
    status: "pass",
    reason,
    runtimeUsed: lane,
    runId: `run-${lane}-1`,
    elapsedMs: 1,
    failureClass: "none",
    sourceLane: lane,
    sourceChatId: "1",
    sourceMessageId: "2",
    traceId: "trace-1",
  };
}

describe("UnifiedCapabilityEngine", () => {
  it("executes explicit capability command and persists memory", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "unified-capability-test-"));
    try {
      const memoryPath = path.join(tempDir, "memory.json");
      const memoryStore = new FileUnifiedMemoryStore(memoryPath);
      const registry = new CapabilityRegistry();
      registry.register(
        {
          id: "status",
          description: "status capability",
          owner: "eve",
          aliases: ["check_status"],
        },
        () => buildCapabilityResult("capability status ok"),
      );
      const engine = new UnifiedCapabilityEngine(registry, {
        memoryStore,
        dispatchLane: async () => fakeLaneState("eve", "capability_probe_ok"),
      });

      const runtime = {
        eveAdapter: new FakeLaneAdapter("eve", {
          status: "pass",
          reason: "eve_lane_not_used",
          runtimeUsed: "eve",
          runId: "lane-eve",
          elapsedMs: 1,
          failureClass: "none",
          sourceLane: "eve",
          sourceChatId: "1",
          sourceMessageId: "2",
          traceId: "lane-trace",
        }),
        hermesAdapter: new FakeLaneAdapter("hermes", {
          status: "pass",
          reason: "hermes_lane_not_used",
          runtimeUsed: "hermes",
          runId: "lane-hermes",
          elapsedMs: 1,
          failureClass: "none",
          sourceLane: "hermes",
          sourceChatId: "1",
          sourceMessageId: "2",
          traceId: "lane-trace",
        }),
        routerConfig: {
          defaultPrimary: "eve" as const,
          defaultFallback: "hermes" as const,
          failClosed: false,
          policyVersion: "v1",
        },
        capabilityEngine: engine,
      };

      const result = await dispatchUnifiedMessage(runtime, {
        channel: "telegram",
        chatId: "100",
        messageId: "200",
        text: "@cap status",
      });

      expect(result.capabilityDecision?.id).toBe("status");
      expect(result.capabilityExecution?.outputText).toBe("capability status ok");
      expect(result.response.responseText).toContain("capability_status_success");

      const raw = await readFile(memoryPath, "utf8");
      expect(raw).toContain("capability-execution");
      expect(raw).toContain(result.envelope.traceId);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("falls back to lane dispatch when capability command is unknown", async () => {
    const runtime = {
      eveAdapter: new FakeLaneAdapter("eve", {
        status: "pass",
        reason: "eve_lane_used",
        runtimeUsed: "eve",
        runId: "lane-eve",
        elapsedMs: 1,
        failureClass: "none",
        sourceLane: "eve",
        sourceChatId: "1",
        sourceMessageId: "2",
        traceId: "lane-trace",
      }),
      hermesAdapter: new FakeLaneAdapter("hermes", {
        status: "pass",
        reason: "hermes_lane_unused",
        runtimeUsed: "hermes",
        runId: "lane-hermes",
        elapsedMs: 1,
        failureClass: "none",
        sourceLane: "hermes",
        sourceChatId: "1",
        sourceMessageId: "2",
        traceId: "lane-trace",
      }),
      routerConfig: {
        defaultPrimary: "eve" as const,
        defaultFallback: "hermes" as const,
        failClosed: false,
        policyVersion: "v1",
      },
      capabilityEngine: new UnifiedCapabilityEngine(
        new CapabilityRegistry(),
        {
          memoryStore: new FileUnifiedMemoryStore(path.join(os.tmpdir(), "unified-capability-fallback.json")),
          dispatchLane: async () => fakeLaneState("eve", "lane_fallback"),
        },
      ),
    };

    const result = await dispatchUnifiedMessage(runtime, {
      channel: "telegram",
      chatId: "100",
      messageId: "200",
      text: "@cap unknown_capability",
    });

    expect(result.capabilityDecision).toBeUndefined();
    expect(result.capabilityExecution).toBeUndefined();
    expect(result.response.laneUsed).toBe("eve");
  });

  it("runs production-style handler via lane dispatch contracts", async () => {
    const memoryPath = path.join(os.tmpdir(), "unified-capability-production-handler.json");
    const registry = new CapabilityRegistry();
    const memoryStore = new FileUnifiedMemoryStore(memoryPath);
    const laneState: DispatchState = {
      status: "pass",
      reason: "hermes_dispatch_success",
      runtimeUsed: "hermes",
      runId: "run-hermes-1",
      elapsedMs: 3,
      failureClass: "none",
      sourceLane: "hermes",
      sourceChatId: "77",
      sourceMessageId: "88",
      traceId: "trace-hermes",
    };

    registerDefaultCapabilityExecutors(registry, {
      dispatchLane: async () => laneState,
      memoryStore,
    });

    const engine = new UnifiedCapabilityEngine(registry, {
      memoryStore,
      dispatchLane: async () => laneState,
    });

    const runtime = {
      eveAdapter: new FakeLaneAdapter("eve", laneState),
      hermesAdapter: new FakeLaneAdapter("hermes", laneState),
      routerConfig: {
        defaultPrimary: "hermes" as const,
        defaultFallback: "none" as const,
        failClosed: true,
        policyVersion: "v1",
      },
      capabilityEngine: engine,
    };

    const result = await dispatchUnifiedMessage(runtime, {
      channel: "telegram",
      chatId: "77",
      messageId: "88",
      text: "@cap summarize_state current-system-health",
    });

    expect(result.capabilityDecision?.id).toBe("summarize_state");
    expect(result.capabilityExecution?.status).toBe("pass");
    expect(result.capabilityExecution?.outputText).toContain("summarize_state succeeded via hermes");
    expect(result.capabilityExecution?.metadata?.runId).toBe("run-hermes-1");
    expect(result.response.failureClass).toBe("none");
  });

  it("denies capability execution when policy is default deny", async () => {
    const registry = new CapabilityRegistry();
    const memoryStore = new FileUnifiedMemoryStore(
      path.join(os.tmpdir(), "unified-capability-policy-deny.json"),
    );
    registerDefaultCapabilityExecutors(registry, {
      dispatchLane: async () => fakeLaneState("eve", "should_not_run"),
      memoryStore,
    });
    const policy = buildCapabilityPolicyFromConfig({
      defaultMode: "deny",
      allowCapabilities: [],
      denyCapabilities: [],
      allowedChatIds: [],
      deniedChatIds: [],
      allowCapabilityChats: {},
      denyCapabilityChats: {},
    });
    const engine = new UnifiedCapabilityEngine(registry, {
      memoryStore,
      dispatchLane: async () => fakeLaneState("eve", "should_not_run"),
      policy,
    });

    const runtime = {
      eveAdapter: new FakeLaneAdapter("eve", fakeLaneState("eve")),
      hermesAdapter: new FakeLaneAdapter("hermes", fakeLaneState("hermes")),
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
    });

    expect(result.capabilityExecution?.status).toBe("failed");
    expect(result.capabilityExecution?.reason).toBe("capability_policy_denied");
    expect(result.capabilityExecution?.failureClass).toBe("policy_failure");
    expect(result.response.failureClass).toBe("policy_failure");
  });

  it("allows capability execution when capability and chat are explicitly allowlisted", async () => {
    const registry = new CapabilityRegistry();
    const memoryStore = new FileUnifiedMemoryStore(
      path.join(os.tmpdir(), "unified-capability-policy-allow.json"),
    );
    registerDefaultCapabilityExecutors(registry, {
      dispatchLane: async () => fakeLaneState("eve", "allowed_run"),
      memoryStore,
    });
    const policyConfig: CapabilityPolicyConfig = {
      defaultMode: "deny",
      allowCapabilities: ["check_status"],
      denyCapabilities: [],
      allowedChatIds: ["chat-7"],
      deniedChatIds: [],
      allowCapabilityChats: {},
      denyCapabilityChats: {},
    };
    const engine = new UnifiedCapabilityEngine(registry, {
      memoryStore,
      dispatchLane: async () => fakeLaneState("eve", "allowed_run"),
      policy: buildCapabilityPolicyFromConfig(policyConfig),
    });
    const runtime = {
      eveAdapter: new FakeLaneAdapter("eve", fakeLaneState("eve")),
      hermesAdapter: new FakeLaneAdapter("hermes", fakeLaneState("hermes")),
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
      chatId: "chat-7",
      messageId: "700",
      text: "@cap status",
    });

    expect(result.capabilityExecution?.status).toBe("pass");
    expect(result.capabilityExecution?.failureClass).toBe("none");
    expect(result.response.failureClass).toBe("none");
  });

  it("denies capability execution when capability-specific chat policy blocks chat", async () => {
    const registry = new CapabilityRegistry();
    const memoryStore = new FileUnifiedMemoryStore(
      path.join(os.tmpdir(), "unified-capability-policy-chat-scope-deny.json"),
    );
    registerDefaultCapabilityExecutors(registry, {
      dispatchLane: async () => fakeLaneState("hermes", "should_not_run"),
      memoryStore,
    });
    const policy = createCapabilityPolicy({
      defaultMode: "allow",
      allowCapabilities: [],
      denyCapabilities: [],
      allowedChatIds: [],
      deniedChatIds: [],
      allowCapabilityChats: {},
      denyCapabilityChats: {
        summarize_state: ["chat-9"],
      },
    });
    const engine = new UnifiedCapabilityEngine(registry, {
      memoryStore,
      dispatchLane: async () => fakeLaneState("hermes", "should_not_run"),
      policy,
    });
    const runtime = {
      eveAdapter: new FakeLaneAdapter("eve", fakeLaneState("eve")),
      hermesAdapter: new FakeLaneAdapter("hermes", fakeLaneState("hermes")),
      routerConfig: {
        defaultPrimary: "hermes" as const,
        defaultFallback: "none" as const,
        failClosed: true,
        policyVersion: "v1",
      },
      capabilityEngine: engine,
    };

    const result = await dispatchUnifiedMessage(runtime, {
      channel: "telegram",
      chatId: "chat-9",
      messageId: "901",
      text: "@cap summarize_state system-overview",
    });

    expect(result.capabilityExecution?.status).toBe("failed");
    expect(result.capabilityExecution?.reason).toBe("capability_chat_denied_by_policy");
    expect(result.capabilityExecution?.failureClass).toBe("policy_failure");
  });

  it("allows capability execution only for configured chat allowlist when present", async () => {
    const registry = new CapabilityRegistry();
    const memoryStore = new FileUnifiedMemoryStore(
      path.join(os.tmpdir(), "unified-capability-policy-chat-scope-allow.json"),
    );
    registerDefaultCapabilityExecutors(registry, {
      dispatchLane: async () => fakeLaneState("hermes", "allowed_by_cap_chat"),
      memoryStore,
    });
    const policy = createCapabilityPolicy({
      defaultMode: "allow",
      allowCapabilities: [],
      denyCapabilities: [],
      allowedChatIds: [],
      deniedChatIds: [],
      allowCapabilityChats: {
        summarize_state: ["chat-42"],
      },
      denyCapabilityChats: {},
    });
    const engine = new UnifiedCapabilityEngine(registry, {
      memoryStore,
      dispatchLane: async () => fakeLaneState("hermes", "allowed_by_cap_chat"),
      policy,
    });
    const runtime = {
      eveAdapter: new FakeLaneAdapter("eve", fakeLaneState("eve")),
      hermesAdapter: new FakeLaneAdapter("hermes", fakeLaneState("hermes")),
      routerConfig: {
        defaultPrimary: "hermes" as const,
        defaultFallback: "none" as const,
        failClosed: true,
        policyVersion: "v1",
      },
      capabilityEngine: engine,
    };

    const denied = await dispatchUnifiedMessage(runtime, {
      channel: "telegram",
      chatId: "chat-0",
      messageId: "902",
      text: "@cap summarize_state system-overview",
    });
    expect(denied.capabilityExecution?.status).toBe("failed");
    expect(denied.capabilityExecution?.reason).toBe("chat_not_in_capability_allowlist");

    const allowed = await dispatchUnifiedMessage(runtime, {
      channel: "telegram",
      chatId: "chat-42",
      messageId: "903",
      text: "@cap summarize_state system-overview",
    });
    expect(allowed.capabilityExecution?.status).toBe("pass");
    expect(allowed.capabilityExecution?.failureClass).toBe("none");
  });

  it("fails with timeout when capability handler exceeds execution budget", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "unified-capability-timeout-"));
    try {
      const memoryPath = path.join(tempDir, "memory.json");
      const memoryStore = new FileUnifiedMemoryStore(memoryPath);
      const registry = new CapabilityRegistry();
      registry.register(
        {
          id: "slow",
          description: "slow capability",
          owner: "eve",
        },
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return buildCapabilityResult("too late");
        },
      );
      const engine = new UnifiedCapabilityEngine(registry, {
        memoryStore,
        dispatchLane: async () => fakeLaneState("eve", "lane_ok"),
        executionTimeoutMs: 50,
      });
      const runtime = {
        eveAdapter: new FakeLaneAdapter("eve", fakeLaneState("eve")),
        hermesAdapter: new FakeLaneAdapter("hermes", fakeLaneState("hermes")),
        routerConfig: {
          defaultPrimary: "eve" as const,
          defaultFallback: "hermes" as const,
          failClosed: false,
          policyVersion: "v1",
        },
        capabilityEngine: engine,
      };

      const result = await dispatchUnifiedMessage(runtime, {
        channel: "telegram",
        chatId: "1",
        messageId: "2",
        text: "@cap slow",
      });

      expect(result.capabilityExecution?.status).toBe("failed");
      expect(result.capabilityExecution?.reason).toBe("capability_execution_timeout");
      expect(result.capabilityExecution?.failureClass).toBe("dispatch_failure");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("invokes onPolicyDenial hook on policy failure", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "unified-cap-deny-hook-"));
    try {
      const auditPath = path.join(tempDir, "denials.jsonl");
      const memoryStore = new FileUnifiedMemoryStore(path.join(tempDir, "m.json"));
      const registry = new CapabilityRegistry();
      registry.register(
        { id: "x", description: "x", owner: "eve" },
        () => buildCapabilityResult("ok"),
      );
      const policy = createCapabilityPolicy({
        defaultMode: "deny",
        allowCapabilities: [],
        denyCapabilities: [],
        allowedChatIds: [],
        deniedChatIds: [],
        allowCapabilityChats: {},
        denyCapabilityChats: {},
      });
      const engine = new UnifiedCapabilityEngine(registry, {
        memoryStore,
        dispatchLane: async () => fakeLaneState("eve"),
        policy,
        onPolicyDenial: async (p) => {
          await appendCapabilityPolicyDenialAudit(auditPath, p);
        },
      });
      const runtime = {
        eveAdapter: new FakeLaneAdapter("eve", fakeLaneState("eve")),
        hermesAdapter: new FakeLaneAdapter("hermes", fakeLaneState("hermes")),
        routerConfig: {
          defaultPrimary: "eve" as const,
          defaultFallback: "hermes" as const,
          failClosed: false,
          policyVersion: "v1",
        },
        capabilityEngine: engine,
      };
      await dispatchUnifiedMessage(runtime, {
        channel: "telegram",
        chatId: "1",
        messageId: "2",
        text: "@cap x",
      });
      const raw = await readFile(auditPath, "utf8");
      expect(raw).toContain("capability_policy_denial");
      expect(raw).toContain("capability_policy_denied");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
