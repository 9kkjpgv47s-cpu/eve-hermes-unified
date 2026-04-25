import { describe, expect, it } from "vitest";
import { routeMessage } from "../src/router/policy-router.js";

const baseConfig = {
  defaultPrimary: "eve" as const,
  defaultFallback: "hermes" as const,
  failClosed: true,
  policyVersion: "v1",
};

describe("routeMessage", () => {
  it("routes @cursor messages to eve lane", () => {
    const decision = routeMessage(
      {
        traceId: "t1",
        channel: "telegram",
        chatId: "1",
        messageId: "2",
        receivedAtIso: new Date().toISOString(),
        text: "@cursor check status",
      },
      baseConfig,
    );
    expect(decision.primaryLane).toBe("eve");
    expect(decision.reason).toBe("explicit_cursor_passthrough");
  });

  it("routes @hermes messages to hermes lane", () => {
    const decision = routeMessage(
      {
        traceId: "t2",
        channel: "telegram",
        chatId: "1",
        messageId: "2",
        receivedAtIso: new Date().toISOString(),
        text: "@hermes summarize",
      },
      baseConfig,
    );
    expect(decision.primaryLane).toBe("hermes");
    expect(decision.reason).toBe("explicit_hermes_passthrough");
  });

  it("falls back to default lane for normal text", () => {
    const decision = routeMessage(
      {
        traceId: "t3",
        channel: "telegram",
        chatId: "1",
        messageId: "2",
        receivedAtIso: new Date().toISOString(),
        text: "hello",
      },
      baseConfig,
    );
    expect(decision.primaryLane).toBe("eve");
    expect(decision.reason).toBe("default_policy_lane");
  });
});
