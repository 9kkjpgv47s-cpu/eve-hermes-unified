import type { DispatchState, FailureClass, LaneId } from "../contracts/types.js";
import type { UnifiedMemoryStore } from "../memory/unified-memory-store.js";

export type CapabilityOwner = "eve" | "hermes" | "shared";

export type CapabilityDefinition = {
  id: string;
  description: string;
  owner: CapabilityOwner;
  aliases?: string[];
};

export type CapabilityExecutionContext = {
  text: string;
  argsText: string;
  chatId: string;
  messageId: string;
  traceId: string;
  /** Passed to lane dispatch when capability budget aborts in-flight subprocess. */
  signal?: AbortSignal;
  dispatchLane: (input: CapabilityLaneDispatchInput) => Promise<DispatchState>;
  memoryStore: UnifiedMemoryStore;
};

export type CapabilityExecutionResult = {
  consumed: boolean;
  responseText: string;
  reason?: string;
  failureClass?: FailureClass;
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

export type CapabilityLaneDispatchInput = {
  lane: LaneId;
  text: string;
  intentRoute: string;
  signal?: AbortSignal;
};

export type CapabilityLaneDispatcher = (
  input: CapabilityLaneDispatchInput & {
    chatId: string;
    messageId: string;
    traceId: string;
  },
) => Promise<DispatchState>;

export type CapabilityRegistrationDeps = {
  dispatchLane: CapabilityLaneDispatcher;
  memoryStore: UnifiedMemoryStore;
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

function stringifyDispatchStateMetadata(state: DispatchState): Record<string, string> {
  return {
    runId: state.runId,
    sourceLane: state.sourceLane,
    runtimeUsed: state.runtimeUsed,
    reason: state.reason,
    failureClass: state.failureClass,
    elapsedMs: String(state.elapsedMs),
  };
}

function summarizeDispatch(prefix: string, state: DispatchState): string {
  const verb = state.status === "pass" ? "succeeded" : "failed";
  return `${prefix} ${verb} via ${state.sourceLane} (run_id=${state.runId}, reason=${state.reason}).`;
}

function missingArgsResult(capabilityId: string): CapabilityExecutionResult {
  return {
    consumed: false,
    reason: `${capabilityId}_missing_args`,
    failureClass: "dispatch_failure",
    responseText: `Capability '${capabilityId}' requires task text after the capability name.`,
    metadata: { capabilityId },
  };
}

export function registerEveCommandWrappers(
  registry: CapabilityRegistry,
  deps?: CapabilityRegistrationDeps,
): void {
  registry.register(
    {
      id: "check_status",
      description: "Query runtime and lane status from Eve adapter.",
      owner: "eve",
      aliases: ["status", "runtime_status"],
    },
    deps
      ? async (context) => {
          const probeText = context.argsText.trim() || "check status";
          const state = await context.dispatchLane({
            lane: "eve",
            text: probeText,
            intentRoute: "capability:check_status",
            signal: context.signal,
          });
          return {
            consumed: state.status === "pass",
            reason: state.reason,
            failureClass: state.failureClass,
            responseText: summarizeDispatch("Capability check_status", state),
            metadata: {
              capabilityId: "check_status",
              owner: "eve",
              ...stringifyDispatchStateMetadata(state),
            },
          };
        }
      : () => ({
          consumed: true,
          responseText: "Capability check_status executed (Eve owner).",
          metadata: { capabilityId: "check_status", owner: "eve" },
        }),
  );
  registry.register(
    {
      id: "eve_dispatch_task",
      description: "Execute Eve task dispatch command wrapper.",
      owner: "eve",
      aliases: ["dispatch_task"],
    },
    deps
      ? async (context) => {
          const taskText = context.argsText.trim();
          if (!taskText) {
            return missingArgsResult("eve_dispatch_task");
          }
          const state = await context.dispatchLane({
            lane: "eve",
            text: taskText,
            intentRoute: "capability:eve_dispatch_task",
            signal: context.signal,
          });
          return {
            consumed: state.status === "pass",
            reason: state.reason,
            failureClass: state.failureClass,
            responseText: summarizeDispatch("Capability eve_dispatch_task", state),
            metadata: {
              capabilityId: "eve_dispatch_task",
              owner: "eve",
              ...stringifyDispatchStateMetadata(state),
            },
          };
        }
      : (context) => ({
          consumed: false,
          responseText: `Capability eve_dispatch_task resolved for trace ${context.traceId}.`,
          metadata: { capabilityId: "eve_dispatch_task", owner: "eve" },
        }),
  );
}

export function registerHermesTools(
  registry: CapabilityRegistry,
  deps?: CapabilityRegistrationDeps,
): void {
  registry.register(
    {
      id: "summarize_state",
      description: "Summarize runtime state via Hermes lane.",
      owner: "hermes",
      aliases: ["summarize", "state_summary"],
    },
    deps
      ? async (context) => {
          const summarizeText = context.argsText.trim() || "summarize state";
          const state = await context.dispatchLane({
            lane: "hermes",
            text: summarizeText,
            intentRoute: "capability:summarize_state",
            signal: context.signal,
          });
          const recentExecutions = await context.memoryStore.list({
            lane: "hermes",
            namespace: "capability-execution",
          });
          const recentCount = String(recentExecutions.length);
          return {
            consumed: state.status === "pass",
            reason: state.reason,
            failureClass: state.failureClass,
            responseText: `${summarizeDispatch("Capability summarize_state", state)} Recent hermes capability records: ${recentCount}.`,
            metadata: {
              capabilityId: "summarize_state",
              owner: "hermes",
              recentRecords: recentCount,
              ...stringifyDispatchStateMetadata(state),
            },
          };
        }
      : () => ({
          consumed: true,
          responseText: "Capability summarize_state executed (Hermes owner).",
          metadata: { capabilityId: "summarize_state", owner: "hermes" },
        }),
  );
  registry.register(
    {
      id: "hermes_dispatch_task",
      description: "Execute Hermes gateway command.",
      owner: "hermes",
      aliases: ["dispatch_task"],
    },
    deps
      ? async (context) => {
          const taskText = context.argsText.trim();
          if (!taskText) {
            return missingArgsResult("hermes_dispatch_task");
          }
          const state = await context.dispatchLane({
            lane: "hermes",
            text: taskText,
            intentRoute: "capability:hermes_dispatch_task",
            signal: context.signal,
          });
          return {
            consumed: state.status === "pass",
            reason: state.reason,
            failureClass: state.failureClass,
            responseText: summarizeDispatch("Capability hermes_dispatch_task", state),
            metadata: {
              capabilityId: "hermes_dispatch_task",
              owner: "hermes",
              ...stringifyDispatchStateMetadata(state),
            },
          };
        }
      : (context) => ({
          consumed: false,
          responseText: `Capability hermes_dispatch_task resolved for trace ${context.traceId}.`,
          metadata: { capabilityId: "hermes_dispatch_task", owner: "hermes" },
        }),
  );
}

export function createDefaultUnifiedCapabilityRegistry(deps?: CapabilityRegistrationDeps): CapabilityRegistry {
  const registry = new CapabilityRegistry();
  registerEveCommandWrappers(registry, deps);
  registerHermesTools(registry, deps);
  return registry;
}

