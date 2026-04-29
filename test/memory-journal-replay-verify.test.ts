import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileUnifiedMemoryStore } from "../src/memory/unified-memory-store.js";

describe("FileUnifiedMemoryStore persistence", () => {
  it("survives delete then reload", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mem-del-reload-"));
    try {
      const mainPath = path.join(dir, "mem.json");
      const a = new FileUnifiedMemoryStore(mainPath);
      await a.set({ lane: "eve", namespace: "n", key: "k" }, "v1");
      await a.delete({ lane: "eve", namespace: "n", key: "k" });
      const b = new FileUnifiedMemoryStore(mainPath);
      expect(await b.get({ lane: "eve", namespace: "n", key: "k" })).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
