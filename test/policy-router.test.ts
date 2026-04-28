import { describe, expect, it } from "vitest";
import { routeMessage, routeMessageWithRegionFailover } from "../src/router/policy-router.js";

const baseConfig = {
  defaultPrimary: "eve" as const,
  defaultFallback: "hermes" as const,
  failClosed: true,
  policyVersion: "v1",
  cutoverStage: "shadow" as const,
  canaryChatIds: [],
  majorityPercent: 50,
  hashSalt: "test-salt",
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
    expect(decision.reason).toBe("stage_shadow_default_primary");
  });

  it("carries failClosed and policyVersion into routing decisions", () => {
    const decision = routeMessage(
      {
        traceId: "t4",
        channel: "telegram",
        chatId: "1",
        messageId: "2",
        receivedAtIso: new Date().toISOString(),
        text: "policy metadata",
      },
      {
        defaultPrimary: "hermes",
        defaultFallback: "eve",
        failClosed: false,
        policyVersion: "v2",
        cutoverStage: "full",
        canaryChatIds: [],
        majorityPercent: 50,
        hashSalt: "test-salt",
      },
    );
    expect(decision.primaryLane).toBe("hermes");
    expect(decision.fallbackLane).toBe("eve");
    expect(decision.failClosed).toBe(false);
    expect(decision.policyVersion).toBe("v2");
  });

  it("keeps default primary in shadow stage", () => {
    const decision = routeMessage(
      {
        traceId: "t5",
        channel: "telegram",
        chatId: "42",
        messageId: "1",
        receivedAtIso: new Date().toISOString(),
        text: "hello from shadow",
      },
      {
        ...baseConfig,
        defaultPrimary: "eve",
        cutoverStage: "shadow",
      },
    );
    expect(decision.primaryLane).toBe("eve");
    expect(decision.reason).toBe("stage_shadow_default_primary");
  });

  it("routes only allowlisted chats to hermes in canary stage", () => {
    const allowlisted = routeMessage(
      {
        traceId: "t6",
        channel: "telegram",
        chatId: "canary-1",
        messageId: "1",
        receivedAtIso: new Date().toISOString(),
        text: "hello",
      },
      {
        ...baseConfig,
        defaultPrimary: "eve",
        cutoverStage: "canary",
        canaryChatIds: ["canary-1"],
      },
    );
    expect(allowlisted.primaryLane).toBe("hermes");
    expect(allowlisted.reason).toBe("stage_canary_allowlist");

    const notAllowlisted = routeMessage(
      {
        traceId: "t7",
        channel: "telegram",
        chatId: "general-1",
        messageId: "1",
        receivedAtIso: new Date().toISOString(),
        text: "hello",
      },
      {
        ...baseConfig,
        defaultPrimary: "eve",
        cutoverStage: "canary",
        canaryChatIds: ["canary-1"],
      },
    );
    expect(notAllowlisted.primaryLane).toBe("eve");
    expect(notAllowlisted.reason).toBe("stage_canary_default_primary");
  });

  it("routes deterministic subset to hermes in majority stage", () => {
    const hermesChat = routeMessage(
      {
        traceId: "t8",
        channel: "telegram",
        chatId: "hermes-bucket-1",
        messageId: "1",
        receivedAtIso: new Date().toISOString(),
        text: "majority candidate",
      },
      {
        ...baseConfig,
        defaultPrimary: "eve",
        cutoverStage: "majority",
        majorityPercent: 50,
      },
    );
    expect(hermesChat.primaryLane).toBe("hermes");
    expect(hermesChat.reason).toBe("stage_majority_weighted");

    const eveChat = routeMessage(
      {
        traceId: "t9",
        channel: "telegram",
        chatId: "eve-bucket-1",
        messageId: "1",
        receivedAtIso: new Date().toISOString(),
        text: "majority candidate",
      },
      {
        ...baseConfig,
        defaultPrimary: "eve",
        cutoverStage: "majority",
        majorityPercent: 50,
      },
    );
    expect(eveChat.primaryLane).toBe("eve");
    expect(eveChat.reason).toBe("stage_majority_default_primary");
  });

  it("forces hermes primary in full stage", () => {
    const decision = routeMessage(
      {
        traceId: "t10",
        channel: "telegram",
        chatId: "777",
        messageId: "1",
        receivedAtIso: new Date().toISOString(),
        text: "hello full",
      },
      {
        ...baseConfig,
        defaultPrimary: "eve",
        cutoverStage: "full",
      },
    );
    expect(decision.primaryLane).toBe("hermes");
    expect(decision.reason).toBe("stage_full_force_hermes");
  });

  it("stamps region metadata and alignment on routing decisions", () => {
    const aligned = routeMessage(
      {
        traceId: "t-r1",
        channel: "telegram",
        chatId: "1",
        messageId: "2",
        receivedAtIso: new Date().toISOString(),
        text: "hello",
        regionId: "us-east",
      },
      { ...baseConfig, routerRegionId: "us-east" },
    );
    expect(aligned.dispatchRegionId).toBe("us-east");
    expect(aligned.routerRegionId).toBe("us-east");
    expect(aligned.regionAligned).toBe(true);

    const misaligned = routeMessage(
      {
        traceId: "t-r2",
        channel: "telegram",
        chatId: "1",
        messageId: "2",
        receivedAtIso: new Date().toISOString(),
        text: "hello",
        regionId: "eu-west",
      },
      { ...baseConfig, routerRegionId: "us-east" },
    );
    expect(misaligned.regionAligned).toBe(false);
  });

  it("routeMessageWithRegionFailover moves primary to fallback lane on region mismatch", () => {
    const envelope = {
      traceId: "t-r3",
      channel: "telegram" as const,
      chatId: "1",
      messageId: "2",
      receivedAtIso: new Date().toISOString(),
      text: "hello",
      regionId: "eu-west",
    };
    const failover = routeMessageWithRegionFailover(envelope, {
      ...baseConfig,
      routerRegionId: "us-east",
      defaultPrimary: "eve",
      defaultFallback: "hermes",
    });
    expect(failover.regionAligned).toBe(false);
    expect(failover.primaryLane).toBe("hermes");
    expect(failover.fallbackLane).toBe("none");
    expect(failover.reason).toBe("region_mismatch_failover_to_fallback_lane");
  });
});
