import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createUnifiedMemoryStoreFromEnv,
  type UnifiedMemoryKey,
} from "../src/memory/unified-memory-store.js";

describe("file-backed unified memory durability", () => {
  it("mirrors writes to the shadow file-backed store when dual-write is enabled", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "unified-memory-dual-"));
    const primaryPath = path.join(dir, "primary.json");
    const shadowPath = path.join(dir, "shadow.json");
    try {
      const store = createUnifiedMemoryStoreFromEnv("file", primaryPath, {
        dualWriteShadowFilePath: shadowPath,
      });
      const key: UnifiedMemoryKey = { lane: "shared", namespace: "n", key: "k" };
      await store.set(key, "v1");

      const primaryRaw = await readFile(primaryPath, "utf8");
      const shadowRaw = await readFile(shadowPath, "utf8");
      const primaryParsed = JSON.parse(primaryRaw) as Array<{ value: string }>;
      const shadowParsed = JSON.parse(shadowRaw) as Array<{ value: string }>;
      expect(primaryParsed).toHaveLength(1);
      expect(shadowParsed).toHaveLength(1);
      expect(primaryParsed[0]?.value).toBe("v1");
      expect(shadowParsed[0]?.value).toBe("v1");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
