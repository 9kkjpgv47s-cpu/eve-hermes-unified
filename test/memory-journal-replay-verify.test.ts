import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileUnifiedMemoryStore, verifyMemorySnapshotPlusJournalMatchesState } from "../src/memory/unified-memory-store.js";

describe("FileUnifiedMemoryStore verify modes", () => {
  it("fails persist when journal replay diverges from in-memory map", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mem-wal-verify-fail-"));
    try {
      const mainPath = path.join(dir, "mem.json");
      const journalPath = path.join(dir, "mem.journal");
      const store = new FileUnifiedMemoryStore(mainPath, journalPath, { verifyJournalReplay: true });
      await store.set({ lane: "eve", namespace: "n", key: "k" }, "v1");
      await appendFile(
        journalPath,
        `${JSON.stringify({
          v: 1,
          op: "set",
          lane: "eve",
          namespace: "n",
          key: "k2",
          value: "orphan",
          updatedAtIso: "2026-01-01T00:00:00.000Z",
        })}\n`,
        "utf8",
      );
      await expect(
        store.set({ lane: "eve", namespace: "n", key: "k" }, "v2", { source: "test" }),
      ).rejects.toThrow(/unified_memory_journal_replay_verify_failed/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("passes persist when snapshot+WAL replay matches", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mem-wal-verify-ok-"));
    try {
      const mainPath = path.join(dir, "mem.json");
      const journalPath = path.join(dir, "mem.journal");
      const store = new FileUnifiedMemoryStore(mainPath, journalPath, { verifyJournalReplay: true });
      await store.set({ lane: "hermes", namespace: "ns", key: "a" }, "v1");
      const j = await readFile(journalPath, "utf8");
      expect(j.trim().length).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("verifyPersist re-reads snapshot and matches", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mem-persist-verify-"));
    try {
      const mainPath = path.join(dir, "mem.json");
      const journalPath = path.join(dir, "mem.journal");
      const store = new FileUnifiedMemoryStore(mainPath, journalPath, { verifyPersist: true });
      await store.set({ lane: "shared", namespace: "x", key: "y" }, "ok");
      const raw = await readFile(mainPath, "utf8");
      expect(raw).toContain("ok");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("verifyMemorySnapshotPlusJournalMatchesState detects drift", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mem-wal-fn-"));
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
          lane: "shared",
          namespace: "x",
          key: "y",
          value: "one",
          updatedAtIso: "2026-01-02T00:00:00.000Z",
        })}\n`,
        "utf8",
      );
      const expected = new Map();
      await expect(
        verifyMemorySnapshotPlusJournalMatchesState(mainPath, journalPath, expected),
      ).rejects.toThrow(/journal_replay_verify/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
