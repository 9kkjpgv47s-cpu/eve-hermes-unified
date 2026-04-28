import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DispatchState, UnifiedDispatchResult } from "../src/contracts/types.js";
import { DISPATCH_FIXTURE_SCHEMA_VERSION } from "../src/contracts/dispatch-fixture-version.js";
import { dispatchUnifiedMessage } from "../src/runtime/unified-dispatch.js";
import type { LaneAdapter, LaneDispatchInput } from "../src/adapters/lane-adapter.js";
import type { RouterPolicyConfig } from "../src/router/policy-router.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, "..", "fixtures", "dispatch");

type DispatchFixtureV1 = {
  dispatchFixtureSchemaVersion: number;
  description?: string;
  input: {
    channel: "telegram";
    chatId: string;
    messageId: string;
    text: string;
    tenantId?: string;
    metadata?: Record<string, string>;
  };
  routerConfig: RouterPolicyConfig;
  expected: {
    routing: UnifiedDispatchResult["routing"];
    primaryState: Omit<DispatchState, "traceId">;
    fallbackState?: Omit<DispatchState, "traceId">;
    /** When no fallback dispatch occurs */
    fallbackStateLane?: null;
    fallbackInfo?: UnifiedDispatchResult["fallbackInfo"];
    response: Pick<UnifiedDispatchResult["response"], "consumed" | "failureClass" | "laneUsed">;
  };
};

class StaticLaneAdapter implements LaneAdapter {
  readonly laneId: "eve" | "hermes";

  constructor(
    laneId: "eve" | "hermes",
    private readonly response: DispatchState,
  ) {
    this.laneId = laneId;
  }

  async dispatch(input: LaneDispatchInput): Promise<DispatchState> {
    return { ...this.response, traceId: input.envelope.traceId };
  }
}

function loadFixture(fileName: string): DispatchFixtureV1 {
  const raw = readFileSync(path.join(FIXTURE_DIR, fileName), "utf8");
  const parsed = JSON.parse(raw) as DispatchFixtureV1;
  expect(parsed.dispatchFixtureSchemaVersion).toBe(DISPATCH_FIXTURE_SCHEMA_VERSION);
  return parsed;
}

function assertDispatchAgainstFixture(result: UnifiedDispatchResult, fixture: DispatchFixtureV1) {
  const { traceId } = result.envelope;
  expect(result.routing).toEqual(fixture.expected.routing);

  expect(result.primaryState).toEqual({
    ...fixture.expected.primaryState,
    traceId,
  });

  if (fixture.expected.fallbackState) {
    expect(result.fallbackState).toEqual({
      ...fixture.expected.fallbackState,
      traceId,
    });
  } else if (fixture.expected.fallbackStateLane === null) {
    expect(result.fallbackState).toBeUndefined();
  }

  if (fixture.expected.fallbackInfo !== undefined) {
    expect(result.fallbackInfo).toEqual(fixture.expected.fallbackInfo);
  }

  expect(result.response.consumed).toBe(fixture.expected.response.consumed);
  expect(result.response.failureClass).toBe(fixture.expected.response.failureClass);
  expect(result.response.laneUsed).toBe(fixture.expected.response.laneUsed);
  expect(result.response.traceId).toBe(traceId);
}

describe("dispatch contract fixtures", () => {
  it("v1-lane-pass.json matches unified dispatch", async () => {
    const fixture = loadFixture("v1-lane-pass.json");
    const primary: DispatchState = {
      ...fixture.expected.primaryState,
      traceId: "placeholder",
    };
    const runtime = {
      eveAdapter: new StaticLaneAdapter("eve", primary),
      hermesAdapter: new StaticLaneAdapter("hermes", {
        status: "pass",
        reason: "should_not_run",
        runtimeUsed: "fixture-hermes",
        runId: "unused",
        elapsedMs: 0,
        failureClass: "none",
        sourceLane: "hermes",
        sourceChatId: fixture.input.chatId,
        sourceMessageId: fixture.input.messageId,
        traceId: "placeholder",
      }),
      routerConfig: fixture.routerConfig,
    };

    const result = await dispatchUnifiedMessage(runtime, fixture.input);
    assertDispatchAgainstFixture(result, fixture);
    expect(result.response.responseText).toContain("eve");
    expect(result.response.responseText).toContain("fixture_ok");
  });

  it("v1-lane-fallback.json matches unified dispatch", async () => {
    const fixture = loadFixture("v1-lane-fallback.json");
    const primary: DispatchState = {
      ...fixture.expected.primaryState,
      traceId: "placeholder",
    };
    const fallback: DispatchState = {
      ...fixture.expected.fallbackState!,
      traceId: "placeholder",
    };
    const runtime = {
      eveAdapter: new StaticLaneAdapter("eve", primary),
      hermesAdapter: new StaticLaneAdapter("hermes", fallback),
      routerConfig: fixture.routerConfig,
    };

    const result = await dispatchUnifiedMessage(runtime, fixture.input);
    assertDispatchAgainstFixture(result, fixture);
    expect(result.response.responseText).toContain("hermes");
    expect(result.response.responseText).toContain("fixture_fallback_ok");
  });
});
