import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dispatchUnifiedMessage } from "../src/runtime/unified-dispatch.js";
import { CapabilityRegistry } from "../src/skills/capability-registry.js";
import { UnifiedCapabilityEngine } from "../src/runtime/capability-engine.js";
import { FileUnifiedMemoryStore } from "../src/memory/unified-memory-store.js";
import { registerDefaultCapabilityExecutors } from "../src/runtime/default-capability-handlers.js";
import { buildCapabilityPolicyFromConfig } from "../src/runtime/capability-policy.js";
import { appendCapabilityPolicyAuditLog } from "../src/runtime/capability-policy-audit-log.js";
import type { DispatchState } from "../src/contracts/types.js";
import type { LaneAdapter } from "../src/adapters/lane-adapter.js";

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

describe("capability policy audit log", () => {
  it("appendCapabilityPolicyAuditLog writes one JSON object per line", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cap-policy-audit-unit-"));
    try {
      const logPath = path.join(dir, "cap-policy.jsonl");
      await appendCapabilityPolicyAuditLog(logPath, {
        recordedAtIso: "2026-01-01T00:00:00.000Z",
        traceId: "t-1",
        capabilityId: "status",
        lane: "eve",
        chatId: "9",
        messageId: "8",
        tenantId: "acme",
        allowed: true,
        policyReason: "allowed_by_default_policy",
      });
      const raw = await readFile(logPath, "utf8");
      const line = raw.trim().split("\n")[0] ?? "";
      const parsed = JSON.parse(line) as Record<string, unknown>;
      expect(parsed.traceId).toBe("t-1");
      expect(parsed.allowed).toBe(true);
      expect(parsed.policyReason).toBe("allowed_by_default_policy");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("logs allow and deny decisions when capabilityPolicyAuditLogPath is set", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cap-policy-audit-int-"));
    try {
      const auditPath = path.join(dir, "policy-audit.jsonl");
      const memoryStore = new FileUnifiedMemoryStore(path.join(dir, "mem.json"));
      const registry = new CapabilityRegistry();
      registerDefaultCapabilityExecutors(registry, {
        dispatchLane: async () => fakeLaneState("eve"),
        memoryStore,
      });
      const policy = buildCapabilityPolicyFromConfig({
        defaultMode: "deny",
        allowCapabilities: ["check_status"],
        denyCapabilities: [],
        allowedChatIds: [],
        deniedChatIds: [],
        allowedTenantIds: [],
        deniedTenantIds: [],
        allowCapabilityChats: {},
        denyCapabilityChats: {},
      });
      const engine = new UnifiedCapabilityEngine(registry, {
        memoryStore,
        dispatchLane: async () => fakeLaneState("eve"),
        policy,
        capabilityPolicyAuditLogPath: auditPath,
      });
      const laneStub: LaneAdapter = {
        laneId: "eve",
        async dispatch() {
          return fakeLaneState("eve");
        },
      };
      const hermesStub: LaneAdapter = {
        laneId: "hermes",
        async dispatch() {
          return fakeLaneState("hermes");
        },
      };
      const runtime = {
        eveAdapter: laneStub,
        hermesAdapter: hermesStub,
        routerConfig: {
          defaultPrimary: "eve" as const,
          defaultFallback: "none" as const,
          failClosed: true,
          policyVersion: "v1",
        },
        capabilityEngine: engine,
      };

      const denied = await dispatchUnifiedMessage(runtime, {
        channel: "telegram",
        chatId: "1",
        messageId: "2",
        text: "@cap summarize_state",
      });
      expect(denied.capabilityExecution?.reason).toBe("capability_policy_denied");

      const allowed = await dispatchUnifiedMessage(runtime, {
        channel: "telegram",
        chatId: "1",
        messageId: "3",
        text: "@cap status",
      });
      expect(allowed.capabilityExecution?.status).toBe("pass");

      const raw = await readFile(auditPath, "utf8");
      const lines = raw.trim().split("\n").filter(Boolean);
      expect(lines.length).toBe(2);
      const first = JSON.parse(lines[0] ?? "{}") as { allowed: boolean; policyReason: string; messageId: string };
      const second = JSON.parse(lines[1] ?? "{}") as { allowed: boolean; policyReason: string; messageId: string };
      expect(first.messageId).toBe("2");
      expect(first.allowed).toBe(false);
      expect(second.messageId).toBe("3");
      expect(second.allowed).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
