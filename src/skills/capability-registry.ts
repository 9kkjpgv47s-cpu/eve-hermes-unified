export type CapabilityOwner = "eve" | "hermes" | "shared";

export type CapabilityDefinition = {
  id: string;
  description: string;
  owner: CapabilityOwner;
  aliases?: string[];
};

export type CapabilityExecutionContext = {
  text: string;
  chatId: string;
  messageId: string;
  traceId: string;
};

export type CapabilityExecutionResult = {
  consumed: boolean;
  responseText: string;
  metadata?: Record<string, string>;
};

export type CapabilityExecutor = (
  context: CapabilityExecutionContext,
) => Promise<CapabilityExecutionResult> | CapabilityExecutionResult;

export type CapabilityConflict = {
  id: string;
  owners: CapabilityOwner[];
  resolution: "first-wins" | "rename-required";
};

export class CapabilityRegistry {
  private readonly byId = new Map<string, CapabilityDefinition>();
  private readonly executors = new Map<string, CapabilityExecutor>();
  private readonly conflicts = new Map<string, CapabilityConflict>();

  register(definition: CapabilityDefinition, executor?: CapabilityExecutor): void {
    const key = definition.id.trim();
    if (!key) {
      throw new Error("Capability id is required.");
    }
    const existing = this.byId.get(key);
    if (!existing) {
      this.byId.set(key, { ...definition, id: key });
      if (executor) {
        this.executors.set(key, executor);
      }
      return;
    }
    if (existing.owner === definition.owner) {
      this.byId.set(key, { ...definition, id: key });
      if (executor) {
        this.executors.set(key, executor);
      }
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

  findByAlias(alias: string): CapabilityDefinition | undefined {
    const normalized = alias.trim().toLowerCase();
    for (const definition of this.byId.values()) {
      const aliases = definition.aliases ?? [];
      if (aliases.some((item) => item.toLowerCase() === normalized)) {
        return definition;
      }
    }
    return undefined;
  }

  getExecutor(id: string): CapabilityExecutor | undefined {
    return this.executors.get(id);
  }
}

export function registerEveCommandWrappers(registry: CapabilityRegistry): void {
  registry.register({
    id: "check_status",
    description: "Query runtime and lane status from Eve adapter.",
    owner: "eve",
    aliases: ["status", "runtime_status"],
  }, () => ({
    consumed: true,
    responseText: "Capability check_status executed (Eve owner).",
    metadata: { capabilityId: "check_status", owner: "eve" },
  }));
  registry.register({
    id: "eve_dispatch_task",
    description: "Execute Eve task dispatch command wrapper.",
    owner: "eve",
    aliases: ["dispatch_task"],
  }, (context) => ({
    consumed: false,
    responseText: `Capability eve_dispatch_task resolved for trace ${context.traceId}.`,
    metadata: { capabilityId: "eve_dispatch_task", owner: "eve" },
  }));
}

export function registerHermesTools(registry: CapabilityRegistry): void {
  registry.register({
    id: "summarize_state",
    description: "Summarize runtime state via Hermes lane.",
    owner: "hermes",
    aliases: ["summarize", "state_summary"],
  }, () => ({
    consumed: true,
    responseText: "Capability summarize_state executed (Hermes owner).",
    metadata: { capabilityId: "summarize_state", owner: "hermes" },
  }));
  registry.register({
    id: "hermes_dispatch_task",
    description: "Execute Hermes gateway command.",
    owner: "hermes",
    aliases: ["dispatch_task"],
  }, (context) => ({
    consumed: false,
    responseText: `Capability hermes_dispatch_task resolved for trace ${context.traceId}.`,
    metadata: { capabilityId: "hermes_dispatch_task", owner: "hermes" },
  }));
}

export function createDefaultUnifiedCapabilityRegistry(): CapabilityRegistry {
  const registry = new CapabilityRegistry();
  registerEveCommandWrappers(registry);
  registerHermesTools(registry);
  return registry;
}

