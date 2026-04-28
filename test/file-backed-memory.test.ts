import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { FileBackedUnifiedMemoryStore } from "../src/memory/file-backed-unified-memory-store.js";

describe("FileBackedUnifiedMemoryStore", () => {
  let dir = "";

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "unified-mem-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("persists chat keys and dispatch events across instances", async () => {
    const file = path.join(dir, "store.json");
    const a = new FileBackedUnifiedMemoryStore(file);
    await a.mergeWorkingSet("c1", { topic: "alpha" });
    await a.appendDispatchEvent({
      chatId: "c1",
      traceId: "t1",
      messageId: "m1",
      lane: "eve",
      phase: "primary",
      status: "pass",
      reason: "ok",
    });

    const b = new FileBackedUnifiedMemoryStore(file);
    const ws = await b.readWorkingSet({ chatId: "c1", traceId: "t2", messageId: "m2" });
    expect(ws.topic).toBe("alpha");
  });
});
