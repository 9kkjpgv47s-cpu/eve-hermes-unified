import { describe, expect, it } from "vitest";
import { InMemoryUnifiedMemoryStore } from "../src/memory/unified-memory-store.js";
import { TenantScopedUnifiedMemoryStore } from "../src/memory/tenant-scoped-memory-store.js";

describe("TenantScopedUnifiedMemoryStore", () => {
  it("prefixes namespaces when tenant id is non-empty", async () => {
    const inner = new InMemoryUnifiedMemoryStore();
    const scoped = new TenantScopedUnifiedMemoryStore(inner, "acme");
    await scoped.set({ lane: "eve", namespace: "ns", key: "k" }, "v1");
    const direct = await inner.get({ lane: "eve", namespace: "ns", key: "k" });
    expect(direct).toBeUndefined();
    const prefixed = await inner.get({ lane: "eve", namespace: "acme::ns", key: "k" });
    expect(prefixed?.value).toBe("v1");
  });

  it("passes through when tenant id is empty", async () => {
    const inner = new InMemoryUnifiedMemoryStore();
    const scoped = new TenantScopedUnifiedMemoryStore(inner, "");
    await scoped.set({ lane: "eve", namespace: "ns", key: "k" }, "v2");
    const got = await inner.get({ lane: "eve", namespace: "ns", key: "k" });
    expect(got?.value).toBe("v2");
  });
});
