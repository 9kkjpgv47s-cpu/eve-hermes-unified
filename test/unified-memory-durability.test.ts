import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createUnifiedMemoryStoreFromEnv } from "../src/memory/unified-memory-store.js";

describe("file-backed memory durability", () => {
  it("mirrors writes to the shadow file-backed store", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "unified-memory-dual-"));
    const primary = path.join(dir, "primary.json");
    const shadow = path.join(dir, "shadow.json");
    try {
      const store = createUnifiedMemoryStoreFromEnv("file", primary, {
        dualWriteShadowFilePath: shadow,
      });
      await store.set({ lane: "eve", namespace: "n", key: "k" }, "v1");
      const primaryRaw = await readFile(primary, "utf8");
      const shadowRaw = await readFile(shadow, "utf8");
      const primaryParsed = JSON.parse(primaryRaw) as unknown[];
      const shadowParsed = JSON.parse(shadowRaw) as unknown[];
      expect(primaryParsed).toEqual(shadowParsed);
      expect((primaryParsed[0] as { value: string }).value).toBe("v1");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects identical primary and shadow paths", () => {
    expect(() =>
      createUnifiedMemoryStoreFromEnv("file", "/tmp/same.json", {
        dualWriteShadowFilePath: "/tmp/same.json",
      }),
    ).toThrow("dualWriteShadowFilePath must differ");
  });
});
