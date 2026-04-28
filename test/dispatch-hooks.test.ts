import { describe, expect, it } from "vitest";
import { dispatchUnifiedMessage } from "../src/runtime/unified-dispatch.js";
import type { LaneAdapter, LaneDispatchInput } from "../src/adapters/lane-adapter.js";
import type { DispatchState } from "../src/contracts/types.js";

describe("dispatchHooks", () => {
  it("fires afterPrimary with lane state", async () => {
    const primaryMs: number[] = [];
    class Eve implements LaneAdapter {
      laneId: "eve" = "eve";
      async dispatch(_input: LaneDispatchInput): Promise<DispatchState> {
        return {
          status: "pass",
          reason: "ok",
          runtimeUsed: "eve",
          runId: "r1",
          elapsedMs: 42,
          failureClass: "none",
          sourceLane: "eve",
          sourceChatId: "1",
          sourceMessageId: "2",
          traceId: "t",
        };
      }
    }
    const runtime = {
      eveAdapter: new Eve(),
      hermesAdapter: new Eve() as unknown as LaneAdapter,
      routerConfig: {
        defaultPrimary: "eve" as const,
        defaultFallback: "none" as const,
        failClosed: true,
        policyVersion: "v1",
      },
      dispatchHooks: {
        afterPrimary(s: DispatchState) {
          primaryMs.push(s.elapsedMs);
        },
      },
    };
    await dispatchUnifiedMessage(runtime, {
      channel: "telegram",
      chatId: "1",
      messageId: "2",
      text: "hi",
    });
    expect(primaryMs).toEqual([42]);
  });
});
