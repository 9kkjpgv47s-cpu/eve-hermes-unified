import { describe, expect, it } from "vitest";
import { TenantScopedUnifiedMemoryStore } from "../src/memory/tenant-scoped-memory-store.js";
import { InMemoryUnifiedMemoryStore } from "../src/memory/unified-memory-store.js";

describe("tenant-scoped memory isolation", () => {
  it("prefixes namespaces so different tenants cannot read each other's keys", async () => {
    const inner = new InMemoryUnifiedMemoryStore();
    const tenantA = new TenantScopedUnifiedMemoryStore(inner, "org-a");
    const tenantB = new TenantScopedUnifiedMemoryStore(inner, "org-b");
    const key = { lane: "eve" as const, namespace: "capability-execution", key: "trace-1" };

    await tenantA.set(key, "payload-a");
    await tenantB.set(key, "payload-b");

    expect((await tenantA.get(key))?.value).toBe("payload-a");
    expect((await tenantB.get(key))?.value).toBe("payload-b");
  });

  it("scopes list queries per tenant namespace", async () => {
    const inner = new InMemoryUnifiedMemoryStore();
    const tenantA = new TenantScopedUnifiedMemoryStore(inner, "t-a");
    const tenantB = new TenantScopedUnifiedMemoryStore(inner, "t-b");
    const base = { lane: "eve" as const, namespace: "capability-execution", key: "k1" };
    await tenantA.set(base, "a");
    await tenantB.set(base, "b");

    const listA = await tenantA.list({ lane: "eve", namespace: "capability-execution" });
    const listB = await tenantB.list({ lane: "eve", namespace: "capability-execution" });
    expect(listA).toHaveLength(1);
    expect(listB).toHaveLength(1);
    expect(listA[0]?.value).toBe("a");
    expect(listB[0]?.value).toBe("b");
  });
});
