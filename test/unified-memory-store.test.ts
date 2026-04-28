import { describe, expect, it } from "vitest";
import { InMemoryUnifiedMemoryStore } from "../src/memory/unified-memory-store.js";

describe("InMemoryUnifiedMemoryStore", () => {
  it("returns working set per chat and records dispatch events", async () => {
    const store = new InMemoryUnifiedMemoryStore();
    store.setChatKey("c1", "topic", "billing");

    const ws = await store.readWorkingSet({ chatId: "c1", traceId: "t1", messageId: "m1" });
    expect(ws.topic).toBe("billing");

    await store.appendDispatchEvent({
      chatId: "c1",
      traceId: "t1",
      messageId: "m1",
      lane: "eve",
      phase: "primary",
      status: "pass",
      reason: "ok",
    });

    expect(store.getEvents()).toHaveLength(1);
    expect(store.getEvents()[0]?.phase).toBe("primary");
  });
});
