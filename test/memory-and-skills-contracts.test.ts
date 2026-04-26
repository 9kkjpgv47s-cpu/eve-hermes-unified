import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  EveMemoryAdapter,
} from "../src/memory/eve-memory-adapter.js";
import {
  HermesMemoryAdapter,
} from "../src/memory/hermes-memory-adapter.js";
import {
  CapabilityRegistry,
  registerEveCommandWrappers,
  registerHermesTools,
} from "../src/skills/capability-registry.js";
import {
  createUnifiedMemoryStoreFromEnv,
  InMemoryUnifiedMemoryStore,
} from "../src/memory/unified-memory-store.js";

describe("UnifiedMemoryStore adapters", () => {
  it("reads and writes through Eve memory adapter with eve lane scope", async () => {
    const store = new InMemoryUnifiedMemoryStore();
    const adapter = new EveMemoryAdapter(store);
    const target = { lane: "eve" as const, namespace: "chat", key: "42" };
    const original = await adapter.get(target);
    expect(original).toBeUndefined();

    await adapter.set(target, "status");
    const updated = await adapter.get(target);
    expect(updated?.value).toBe("status");
    expect(updated?.lane).toBe("eve");
  });

  it("reads and writes through Hermes memory adapter with hermes lane scope", async () => {
    const store = new InMemoryUnifiedMemoryStore();
    const adapter = new HermesMemoryAdapter(store);
    const target = { lane: "hermes" as const, namespace: "session", key: "abc" };
    await adapter.set(target, "2");
    const value = await adapter.get(target);
    expect(value?.value).toBe("2");
    expect(value?.lane).toBe("hermes");
  });

  it("lists entries by lane and key prefix", async () => {
    const store = new InMemoryUnifiedMemoryStore();
    const eve = new EveMemoryAdapter(store);
    const hermes = new HermesMemoryAdapter(store);
    await eve.set({ lane: "eve", namespace: "chat", key: "a-1" }, "one");
    await eve.set({ lane: "eve", namespace: "chat", key: "a-2" }, "two");
    await hermes.set({ lane: "hermes", namespace: "chat", key: "b-1" }, "three");

    const eveValues = await eve.list({ lane: "eve", keyPrefix: "a-" });
    const hermesValues = await hermes.list({ lane: "hermes" });
    expect(eveValues).toHaveLength(2);
    expect(hermesValues).toHaveLength(1);
  });

  it("persists entries when file-backed memory store is selected", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "unified-memory-test-"));
    const memoryFilePath = path.join(tempDir, "memory.json");
    const store = createUnifiedMemoryStoreFromEnv("file", memoryFilePath);
    const eve = new EveMemoryAdapter(store);
    await eve.set({ lane: "eve", namespace: "chat", key: "persist-1" }, "persisted");

    const raw = await readFile(memoryFilePath, "utf8");
    expect(raw).toContain("persist-1");
    expect(raw).toContain("persisted");
  });
});

describe("CapabilityRegistry", () => {
  it("registers Eve and Hermes capabilities with explicit owners", () => {
    const registry = new CapabilityRegistry();
    registerEveCommandWrappers(registry);
    registerHermesTools(registry);

    const capabilities = registry.list();
    expect(capabilities.map((item) => item.id)).toContain("check_status");
    expect(capabilities.map((item) => item.id)).toContain("summarize_state");
    const conflicts = registry.listConflicts();
    expect(conflicts).toHaveLength(0);
  });

  it("rejects empty capability IDs", () => {
    const registry = new CapabilityRegistry();
    expect(() =>
      registry.register({
        id: "   ",
        description: "invalid",
        owner: "shared",
      }),
    ).toThrowError("Capability id is required.");
  });

  it("resolves capabilities by alias and exposes executor", async () => {
    const registry = new CapabilityRegistry();
    registerEveCommandWrappers(registry);
    const capability = registry.findByAlias("status");
    expect(capability?.id).toBe("check_status");

    const executor = registry.getExecutor("check_status");
    expect(executor).toBeDefined();
    const execution = await executor?.({
      text: "@cap status",
      traceId: "trace-x",
      chatId: "1",
      messageId: "2",
    });
    expect(execution?.consumed).toBe(true);
  });
});
