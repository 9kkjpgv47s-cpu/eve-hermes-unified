import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileUnifiedMemoryStore } from "../src/memory/unified-memory-store.js";

describe("FileUnifiedMemoryStore atomic persistence", () => {
  it("reloads persisted state from disk in a new process instance", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mem-file-reload-"));
    try {
      const mainPath = path.join(dir, "mem.json");
      await mkdir(dir, { recursive: true });
      const first = new FileUnifiedMemoryStore(mainPath);
      await first.set({ lane: "eve", namespace: "n", key: "k" }, "from-first", {});
      const second = new FileUnifiedMemoryStore(mainPath);
      const got = await second.get({ lane: "eve", namespace: "n", key: "k" });
      expect(got?.value).toBe("from-first");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes valid JSON array snapshot after set", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mem-file-snapshot-"));
    try {
      const mainPath = path.join(dir, "mem.json");
      const store = new FileUnifiedMemoryStore(mainPath);
      await store.set({ lane: "shared", namespace: "x", key: "y" }, "v1");
      const mainRaw = await readFile(mainPath, "utf8");
      expect(mainRaw).toContain("v1");
      const parsed = JSON.parse(mainRaw) as unknown;
      expect(Array.isArray(parsed)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
