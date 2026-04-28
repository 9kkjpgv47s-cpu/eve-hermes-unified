import { describe, expect, it } from "vitest";
import { CapabilityRegistry, defaultCapabilityCatalog } from "../src/capabilities/capability-registry.js";

describe("CapabilityRegistry", () => {
  it("default catalog scopes capabilities by lane", () => {
    const r = new CapabilityRegistry();
    r.registerAll(defaultCapabilityCatalog);
    expect(r.forLane("eve").map((c) => c.id)).toEqual(["eve.dispatch_script"]);
    expect(r.forLane("hermes").map((c) => c.id)).toEqual(["hermes.gateway"]);
  });
});
