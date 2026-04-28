import { describe, expect, it } from "vitest";
import { InMemoryUnifiedMemoryStore } from "../src/memory/unified-memory-store.js";
import { TenantScopedMemoryStore } from "../src/memory/tenant-scoped-memory-store.js";

describe("TenantScopedMemoryStore", () => {
  it("isolates namespaces between tenants", async () => {
    const inner = new InMemoryUnifiedMemoryStore();
    const a = new TenantScopedMemoryStore(inner, "a");
    const b = new TenantScopedMemoryStore(inner, "b");
    await a.set({ lane: "eve", namespace: "ns", key: "k" }, "one");
    await b.set({ lane: "eve", namespace: "ns", key: "k" }, "two");
    expect((await a.get({ lane: "eve", namespace: "ns", key: "k" }))?.value).toBe("one");
    expect((await b.get({ lane: "eve", namespace: "ns", key: "k" }))?.value).toBe("two");
  });
});
