import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createUnifiedMemoryStoreFromEnv } from "../src/memory/unified-memory-store.js";

describe("UNIFIED_MEMORY_VERIFY_PERSIST", () => {
  it("passes when snapshot matches after persist", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mem-verify-"));
    try {
      const main = path.join(dir, "m.json");
      const journal = path.join(dir, "m.journal");
      const store = createUnifiedMemoryStoreFromEnv("file", main, journal, { verifyPersist: true });
      await store.set({ lane: "eve", namespace: "n", key: "k" }, "v");
      const raw = await readFile(main, "utf8");
      expect(raw).toContain("v");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
