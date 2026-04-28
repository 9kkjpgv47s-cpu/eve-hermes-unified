import { describe, expect, it } from "vitest";
import { applyHermesStructuredDiagnostics, parseHermesStructuredStderr } from "../src/adapters/hermes-stderr-protocol.js";
import type { DispatchState } from "../src/contracts/types.js";

function failedBase(): DispatchState {
  return {
    status: "failed",
    reason: "hermes_dispatch_exit_1",
    runtimeUsed: "hermes",
    runId: "r1",
    elapsedMs: 1,
    failureClass: "dispatch_failure",
    sourceLane: "hermes",
    sourceChatId: "1",
    sourceMessageId: "2",
    traceId: "t",
  };
}

describe("parseHermesStructuredStderr", () => {
  it("parses UNIFIED_HERMES_JSON line", () => {
    const stderr = "noise\nUNIFIED_HERMES_JSON:{\"failureClass\":\"provider_limit\",\"reason\":\"quota\"}\n";
    expect(parseHermesStructuredStderr(stderr)?.failureClass).toBe("provider_limit");
  });
});

describe("applyHermesStructuredDiagnostics", () => {
  it("overrides failureClass when valid", () => {
    const stderr = 'UNIFIED_HERMES_JSON:{"failureClass":"policy_failure","reason":"blocked"}';
    const out = applyHermesStructuredDiagnostics(failedBase(), stderr);
    expect(out.failureClass).toBe("policy_failure");
    expect(out.reason).toContain("hermes_stderr:");
  });

  it("ignores invalid failureClass", () => {
    const stderr = 'UNIFIED_HERMES_JSON:{"failureClass":"not_a_real_class"}';
    const out = applyHermesStructuredDiagnostics(failedBase(), stderr);
    expect(out.failureClass).toBe("dispatch_failure");
  });
});
