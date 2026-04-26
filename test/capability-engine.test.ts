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
      const engine = new UnifiedCapabilityEngine(registry, memoryStore);

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
        new FileUnifiedMemoryStore(path.join(os.tmpdir(), "unified-capability-fallback.json")),
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
});
