import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runRuntimePreflight } from "../src/runtime/preflight.js";
import {
  createUnifiedMemoryStoreFromEnv,
  DualWriteUnifiedMemoryStore,
  FileUnifiedMemoryStore,
  InMemoryUnifiedMemoryStore,
} from "../src/memory/unified-memory-store.js";

describe("FileUnifiedMemoryStore durability", () => {
  it("persists via atomic replace so readers never see a partial JSON file", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "unified-memory-atomic-"));
    try {
      const memoryPath = path.join(dir, "memory.json");
      const store = new FileUnifiedMemoryStore(memoryPath);
      const key = { lane: "eve" as const, namespace: "chat", key: "k1" };
      await store.set(key, "v1");
      const raw = await readFile(memoryPath, "utf8");
      expect(() => JSON.parse(raw)).not.toThrow();
      expect(JSON.parse(raw)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ lane: "eve", namespace: "chat", key: "k1", value: "v1" }),
        ]),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("serializes concurrent writes without corrupt JSON on disk", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "unified-memory-concurrent-"));
    try {
      const memoryPath = path.join(dir, "memory.json");
      const store = new FileUnifiedMemoryStore(memoryPath);
      await Promise.all(
        Array.from({ length: 40 }, (_, index) =>
          store.set(
            { lane: "shared", namespace: "n", key: `key-${index}` },
            `value-${index}`,
          ),
        ),
      );
      const raw = await readFile(memoryPath, "utf8");
      const parsed = JSON.parse(raw) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(40);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("DualWriteUnifiedMemoryStore", () => {
  it("mirrors writes to the shadow file-backed store", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "unified-memory-dual-"));
    try {
      const primaryPath = path.join(dir, "primary.json");
      const shadowPath = path.join(dir, "shadow.json");
      const store = createUnifiedMemoryStoreFromEnv("file", primaryPath, {
        dualWriteShadowFilePath: shadowPath,
      });
      const key = { lane: "hermes" as const, namespace: "s", key: "x" };
      await store.set(key, "dual");
      const primaryRaw = await readFile(primaryPath, "utf8");
      const shadowRaw = await readFile(shadowPath, "utf8");
      expect(primaryRaw).toBe(shadowRaw);
      expect(primaryRaw).toContain("dual");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("ignores identical primary and shadow paths", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "unified-memory-dual-same-"));
    try {
      const p = path.join(dir, "only.json");
      const store = createUnifiedMemoryStoreFromEnv("file", p, {
        dualWriteShadowFilePath: p,
      });
      await store.set({ lane: "eve", namespace: "n", key: "a" }, "1");
      const raw = await readFile(p, "utf8");
      const entries = JSON.parse(raw) as unknown[];
      expect(entries).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("propagates delete to shadow", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "unified-memory-dual-del-"));
    try {
      const primaryPath = path.join(dir, "primary.json");
      const shadowPath = path.join(dir, "shadow.json");
      const primary = new FileUnifiedMemoryStore(primaryPath);
      const shadow = new FileUnifiedMemoryStore(shadowPath);
      const store = new DualWriteUnifiedMemoryStore(primary, shadow);
      const key = { lane: "shared" as const, namespace: "n", key: "delme" };
      await store.set(key, "x");
      await store.delete(key);
      const p = JSON.parse(await readFile(primaryPath, "utf8")) as unknown[];
      const s = JSON.parse(await readFile(shadowPath, "utf8")) as unknown[];
      expect(p).toHaveLength(0);
      expect(s).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("runRuntimePreflight memory dual-write", () => {
  it("rejects when dual-write path equals primary path", async () => {
    await expect(
      runRuntimePreflight({
        enabled: true,
        strict: true,
        eveDispatchScript: "/bin/true",
        eveDispatchResultPath: "/tmp/eve.json",
        hermesLaunchCommand: "/bin/true",
        unifiedMemoryStoreKind: "file",
        unifiedMemoryFilePath: "/tmp/same-memory.json",
        unifiedMemoryDualWriteFilePath: "/tmp/same-memory.json",
        auditEnabled: false,
        auditLogPath: "/tmp/audit.jsonl",
      }),
    ).rejects.toThrow("dual-write path must differ");
  });

  it("passes when dual-write path is distinct and writable", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "unified-preflight-dual-"));
    try {
      const primary = path.join(dir, "a.json");
      const shadow = path.join(dir, "b.json");
      await expect(
        runRuntimePreflight({
          enabled: true,
          strict: true,
          eveDispatchScript: "/bin/true",
          eveDispatchResultPath: path.join(dir, "eve.json"),
          hermesLaunchCommand: "/bin/true",
          unifiedMemoryStoreKind: "file",
          unifiedMemoryFilePath: primary,
          unifiedMemoryDualWriteFilePath: shadow,
          auditEnabled: false,
          auditLogPath: path.join(dir, "audit.jsonl"),
        }),
      ).resolves.toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("crash/restart replay", () => {
  it("reloads committed state into a new store instance", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "unified-memory-restart-"));
    try {
      const memoryPath = path.join(dir, "memory.json");
      const first = new FileUnifiedMemoryStore(memoryPath);
      const key = { lane: "eve" as const, namespace: "chat", key: "session" };
      await first.set(key, "checkpoint");
      const second = new FileUnifiedMemoryStore(memoryPath);
      const loaded = await second.get(key);
      expect(loaded?.value).toBe("checkpoint");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("InMemoryUnifiedMemoryStore is isolated per instance (no cross-process durability)", async () => {
    const a = new InMemoryUnifiedMemoryStore();
    const b = new InMemoryUnifiedMemoryStore();
    await a.set({ lane: "eve", namespace: "n", key: "k" }, "only-a");
    expect(await b.get({ lane: "eve", namespace: "n", key: "k" })).toBeUndefined();
  });
});
