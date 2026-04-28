import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROUTER_TELEMETRY_SCHEMA_VERSION } from "../src/contracts/router-telemetry-version.js";
import { appendRouterTelemetryNoFallbackSkipped } from "../src/runtime/router-telemetry-append.js";

describe("appendRouterTelemetryNoFallbackSkipped", () => {
  it("writes one JSONL line with expected fields", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "router-tel-append-"));
    const logPath = path.join(dir, "tel.jsonl");
    try {
      await appendRouterTelemetryNoFallbackSkipped(logPath, {
        envelope: {
          traceId: "t-x",
          channel: "telegram",
          chatId: "1",
          messageId: "2",
          receivedAtIso: new Date().toISOString(),
          text: "hi",
          tenantId: "acme",
        },
        routing: {
          primaryLane: "eve",
          fallbackLane: "hermes",
          reason: "default_policy_lane",
          policyVersion: "v1",
          failClosed: false,
        },
        primaryState: {
          status: "failed",
          reason: "blocked",
          runtimeUsed: "eve",
          runId: "r1",
          elapsedMs: 2,
          failureClass: "policy_failure",
          sourceLane: "eve",
          sourceChatId: "1",
          sourceMessageId: "2",
          traceId: "t-x",
        },
        skippedFallbackLane: "hermes",
        noFallbackOnPrimaryFailureClasses: ["policy_failure"],
      });
      const raw = await readFile(logPath, "utf8");
      const row = JSON.parse(raw.trim()) as {
        auditSchemaVersion: number;
        eventType: string;
        tenantId: string;
        skippedFallbackLane: string;
      };
      expect(row.auditSchemaVersion).toBe(ROUTER_TELEMETRY_SCHEMA_VERSION);
      expect(row.eventType).toBe("router_no_fallback_skipped");
      expect(row.tenantId).toBe("acme");
      expect(row.skippedFallbackLane).toBe("hermes");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
