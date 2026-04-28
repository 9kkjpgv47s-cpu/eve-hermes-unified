import type { LaneId } from "../contracts/types.js";

export type CapabilityDefinition = {
  id: string;
  name: string;
  description: string;
  lanes: readonly LaneId[];
};

/**
 * Phase-4 convergence: single catalog of Eve wrappers and Hermes tools.
 * Lanes filter what they expose; dispatch can attach the filtered list to `LaneDispatchInput`.
 */
export class CapabilityRegistry {
  private readonly byId = new Map<string, CapabilityDefinition>();

  register(def: CapabilityDefinition): void {
    this.byId.set(def.id, def);
  }

  registerAll(defs: readonly CapabilityDefinition[]): void {
    for (const d of defs) {
      this.register(d);
    }
  }

  list(): CapabilityDefinition[] {
    return [...this.byId.values()];
  }

  forLane(lane: LaneId): CapabilityDefinition[] {
    return this.list().filter((c) => c.lanes.includes(lane));
  }

  get(id: string): CapabilityDefinition | undefined {
    return this.byId.get(id);
  }
}

export const defaultCapabilityCatalog: readonly CapabilityDefinition[] = [
  {
    id: "eve.dispatch_script",
    name: "Eve task dispatch",
    description: "Legacy shell dispatch contract (eve-task-dispatch.sh).",
    lanes: ["eve"],
  },
  {
    id: "hermes.gateway",
    name: "Hermes gateway",
    description: "Configurable Hermes subprocess entry (HERMES_LAUNCH_*).",
    lanes: ["hermes"],
  },
];
