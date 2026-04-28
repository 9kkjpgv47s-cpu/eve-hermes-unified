import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileUnifiedMemoryStore } from "../src/memory/unified-memory-store.js";

describe("FileUnifiedMemoryStore atomic persistence", () => {
  it("writes via temp file then rename so on-disk file stays JSON-parseable", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "unified-memory-atomic-"));
    const memoryPath = path.join(dir, "memory.json");
    const store = new FileUnifiedMemoryStore(memoryPath);
    await store.set({ lane: "eve", namespace: "n", key: "k1" }, "v1");
    await store.set({ lane: "hermes", namespace: "n", key: "k2" }, "v2");
    const raw = await readFile(memoryPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    expect(Array.isArray(parsed)).toBe(true);
    expect(JSON.stringify(parsed)).toContain("v2");
  });

  it("survives reload after multiple mutations (crash-safe path semantics)", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "unified-memory-atomic-reload-"));
    const memoryPath = path.join(dir, "mem.json");
    const store1 = new FileUnifiedMemoryStore(memoryPath);
    for (let i = 0; i < 10; i += 1) {
      await store1.set({ lane: "shared", namespace: "batch", key: `key-${i}` }, `val-${i}`);
    }
    const store2 = new FileUnifiedMemoryStore(memoryPath);
    const last = await store2.get({ lane: "shared", namespace: "batch", key: "key-9" });
    expect(last?.value).toBe("val-9");
  });
});
