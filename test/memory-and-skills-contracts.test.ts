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
import { InMemoryUnifiedMemoryStore } from "../src/memory/unified-memory-store.js";

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
});

describe("CapabilityRegistry", () => {
  it("registers Eve and Hermes capabilities and detects ownership conflicts", () => {
    const registry = new CapabilityRegistry();
    registerEveCommandWrappers(registry);
    registerHermesTools(registry);

    const capabilities = registry.list();
    expect(capabilities.map((item) => item.id)).toContain("check_status");
    expect(capabilities.map((item) => item.id)).toContain("summarize_state");
    const conflicts = registry.listConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.id).toBe("dispatch_task");
    expect(conflicts[0]?.resolution).toBe("rename-required");
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
});
