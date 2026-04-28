import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileUnifiedMemoryStore } from "../src/memory/unified-memory-store.js";

describe("FileUnifiedMemoryStore journal replay", () => {
  it("replays journal entries when main snapshot is empty", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mem-wal-replay-"));
    try {
      const mainPath = path.join(dir, "mem.json");
      const journalPath = path.join(dir, "mem.journal");
      await mkdir(dir, { recursive: true });
      await writeFile(mainPath, "[]\n", "utf8");
      await writeFile(
        journalPath,
        `${JSON.stringify({
          v: 1,
          op: "set",
          lane: "eve",
          namespace: "n",
          key: "k",
          value: "from-wal",
          updatedAtIso: "2026-01-01T00:00:00.000Z",
        })}\n`,
        "utf8",
      );

      const store = new FileUnifiedMemoryStore(mainPath, journalPath);
      const got = await store.get({ lane: "eve", namespace: "n", key: "k" });
      expect(got?.value).toBe("from-wal");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("clears journal after successful persist", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mem-wal-clear-"));
    try {
      const mainPath = path.join(dir, "mem.json");
      const journalPath = path.join(dir, "mem.journal");
      const store = new FileUnifiedMemoryStore(mainPath, journalPath);
      await store.set({ lane: "shared", namespace: "x", key: "y" }, "v1");
      const journalRaw = await readFile(journalPath, "utf8");
      expect(journalRaw.trim().length).toBe(0);
      const mainRaw = await readFile(mainPath, "utf8");
      expect(mainRaw).toContain("v1");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
