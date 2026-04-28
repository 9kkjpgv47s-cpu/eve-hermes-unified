import { describe, expect, it } from "vitest";
import { dispatchUnifiedMessage } from "../src/runtime/unified-dispatch.js";
import type { LaneAdapter, LaneDispatchInput } from "../src/adapters/lane-adapter.js";
import type { DispatchState } from "../src/contracts/types.js";
import { FileBackedUnifiedMemoryStore } from "../src/memory/file-backed-unified-memory-store.js";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

describe("dispatchUnifiedMessage with file memory", () => {
  it("merges last_lane into file-backed store after pass", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "dispatch-mem-"));
    try {
      const file = path.join(dir, "m.json");
      const memoryStore = new FileBackedUnifiedMemoryStore(file);

      class PassEve implements LaneAdapter {
        laneId: "eve" = "eve";
        async dispatch(input: LaneDispatchInput): Promise<DispatchState> {
          expect(input.memorySnapshot).toEqual({});
          return {
            status: "pass",
            reason: "ok",
            runtimeUsed: "eve",
            runId: "r1",
            elapsedMs: 1,
            failureClass: "none",
            sourceLane: "eve",
            sourceChatId: input.envelope.chatId,
            sourceMessageId: input.envelope.messageId,
            traceId: input.envelope.traceId,
          };
        }
      }

      class UnusedHermes implements LaneAdapter {
        laneId: "hermes" = "hermes";
        async dispatch(): Promise<DispatchState> {
          throw new Error("hermes should not run");
        }
      }

      const runtime = {
        eveAdapter: new PassEve(),
        hermesAdapter: new UnusedHermes(),
        routerConfig: {
          defaultPrimary: "eve" as const,
          defaultFallback: "none" as const,
          failClosed: true,
          policyVersion: "v1",
        },
        memoryStore,
      };

      await dispatchUnifiedMessage(runtime, {
        channel: "telegram",
        chatId: "99",
        messageId: "1",
        text: "hi",
      });

      const ws = await memoryStore.readWorkingSet({ chatId: "99", traceId: "x", messageId: "y" });
      expect(ws.last_lane).toBe("eve");
      expect(ws.last_run_id).toBe("r1");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
