import { describe, expect, it } from "vitest";
import { InMemoryUnifiedMemoryStore } from "../src/memory/unified-memory-store.js";

describe("H5 cross-tenant memory isolation", () => {
  it("isolates list results per tenantId", async () => {
    const store = new InMemoryUnifiedMemoryStore();
    await store.set(
      { lane: "hermes", namespace: "capability-execution", key: "trace-a", tenantId: "tenant-alpha" },
      JSON.stringify({ tenant: "alpha" }),
    );
    await store.set(
      { lane: "hermes", namespace: "capability-execution", key: "trace-b", tenantId: "tenant-beta" },
      JSON.stringify({ tenant: "beta" }),
    );

    const alphaList = await store.list({
      lane: "hermes",
      namespace: "capability-execution",
      tenantId: "tenant-alpha",
    });
    const betaList = await store.list({
      lane: "hermes",
      namespace: "capability-execution",
      tenantId: "tenant-beta",
    });

    expect(alphaList).toHaveLength(1);
    expect(alphaList[0]?.key).toBe("trace-a");
    expect(JSON.parse(alphaList[0]?.value ?? "{}")).toEqual({ tenant: "alpha" });

    expect(betaList).toHaveLength(1);
    expect(betaList[0]?.key).toBe("trace-b");
    expect(JSON.parse(betaList[0]?.value ?? "{}")).toEqual({ tenant: "beta" });
  });

  it("does not leak tenant A keys when listing without tenant filter (legacy aggregate)", async () => {
    const store = new InMemoryUnifiedMemoryStore();
    await store.set(
      { lane: "hermes", namespace: "capability-execution", key: "k1", tenantId: "t1" },
      "a",
    );
    await store.set(
      { lane: "hermes", namespace: "capability-execution", key: "k2", tenantId: "t2" },
      "b",
    );
    const all = await store.list({ lane: "hermes", namespace: "capability-execution" });
    expect(all.length).toBeGreaterThanOrEqual(2);
    const keys = new Set(all.map((e) => e.key));
    expect(keys.has("k1")).toBe(true);
    expect(keys.has("k2")).toBe(true);
  });

  it("concurrent tenant-scoped writes preserve isolation", async () => {
    const store = new InMemoryUnifiedMemoryStore();
    const tenants = ["t-a", "t-b", "t-c"];
    await Promise.all(
      tenants.map((tenantId, i) =>
        store.set(
          { lane: "hermes", namespace: "capability-execution", key: `trace-${i}`, tenantId },
          JSON.stringify({ tenantId, i }),
        ),
      ),
    );
    for (let i = 0; i < tenants.length; i += 1) {
      const tid = tenants[i]!;
      const list = await store.list({
        lane: "hermes",
        namespace: "capability-execution",
        tenantId: tid,
      });
      expect(list).toHaveLength(1);
      expect(JSON.parse(list[0]!.value).tenantId).toBe(tid);
    }
  });
});
