export type CapabilityOwner = "eve" | "hermes" | "shared";

export type CapabilityDefinition = {
  id: string;
  description: string;
  owner: CapabilityOwner;
  aliases?: string[];
};

export type CapabilityConflict = {
  id: string;
  owners: CapabilityOwner[];
  resolution: "first-wins" | "rename-required";
};

export class CapabilityRegistry {
  private readonly byId = new Map<string, CapabilityDefinition>();
  private readonly conflicts = new Map<string, CapabilityConflict>();

  register(definition: CapabilityDefinition): void {
    const key = definition.id.trim();
    if (!key) {
      throw new Error("Capability id is required.");
    }
    const existing = this.byId.get(key);
    if (!existing) {
      this.byId.set(key, { ...definition, id: key });
      return;
    }
    if (existing.owner === definition.owner) {
      this.byId.set(key, { ...definition, id: key });
      return;
    }
    this.conflicts.set(key, {
      id: key,
      owners: [existing.owner, definition.owner],
      resolution: "rename-required",
    });
  }

  get(id: string): CapabilityDefinition | undefined {
    return this.byId.get(id);
  }

  list(): CapabilityDefinition[] {
    return [...this.byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  listConflicts(): CapabilityConflict[] {
    return [...this.conflicts.values()].sort((a, b) => a.id.localeCompare(b.id));
  }
}

export function registerEveCommandWrappers(registry: CapabilityRegistry): void {
  registry.register({
    id: "dispatch_task",
    description: "Execute Eve task dispatch command wrapper.",
    owner: "eve",
    aliases: ["eve_dispatch_task"],
  });
  registry.register({
    id: "check_status",
    description: "Query runtime and lane status from Eve adapter.",
    owner: "eve",
  });
}

export function registerHermesTools(registry: CapabilityRegistry): void {
  registry.register({
    id: "dispatch_task",
    description: "Execute Hermes gateway command.",
    owner: "hermes",
    aliases: ["hermes_dispatch_task"],
  });
  registry.register({
    id: "summarize_state",
    description: "Summarize runtime state via Hermes lane.",
    owner: "hermes",
  });
}

export function createDefaultUnifiedCapabilityRegistry(): CapabilityRegistry {
  const registry = new CapabilityRegistry();
  registerEveCommandWrappers(registry);
  registerHermesTools(registry);
  return registry;
}

