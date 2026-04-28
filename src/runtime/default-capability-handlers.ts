import type { DispatchState } from "../contracts/types.js";
import type {
  CapabilityRegistry,
  CapabilityRegistrationDeps,
  CapabilityExecutionResult,
} from "../skills/capability-registry.js";

function summarizeDispatch(prefix: string, state: DispatchState): string {
  const verb = state.status === "pass" ? "succeeded" : "failed";
  return `${prefix} ${verb} via ${state.sourceLane} (run_id=${state.runId}, reason=${state.reason}).`;
}

function dispatchMetadata(capabilityId: string, owner: "eve" | "hermes", state: DispatchState): Record<string, string> {
  return {
    capabilityId,
    owner,
    runId: state.runId,
    lane: state.sourceLane,
    failureClass: state.failureClass,
    elapsedMs: String(state.elapsedMs),
    reason: state.reason,
    runtimeUsed: state.runtimeUsed,
  };
}

function missingArgsResult(capabilityId: string): CapabilityExecutionResult {
  return {
    consumed: false,
    reason: `${capabilityId}_missing_args`,
    responseText: `Capability '${capabilityId}' requires task text after the capability name.`,
    metadata: { capabilityId },
  };
}

function buildLaneDispatcher(deps: CapabilityRegistrationDeps) {
  return async (
    lane: "eve" | "hermes",
    text: string,
    intentRoute: string,
    chatId: string,
    messageId: string,
    traceId: string,
  ): Promise<DispatchState> => {
    return deps.dispatchLane({
      lane,
      text,
      intentRoute,
      chatId,
      messageId,
      traceId,
    });
  };
}

export function registerDefaultCapabilityExecutors(
  registry: CapabilityRegistry,
  deps: CapabilityRegistrationDeps,
): void {
  const dispatchLane = buildLaneDispatcher(deps);

  registry.register(
    {
      id: "check_status",
      description: "Query runtime and lane status from Eve adapter.",
      owner: "eve",
      aliases: ["status", "runtime_status"],
    },
    async (context) => {
      const probe = context.argsText.trim() || "check status";
      const state = await dispatchLane(
        "eve",
        probe,
        "capability:check_status",
        context.chatId,
        context.messageId,
        context.traceId,
      );
      return {
        consumed: state.status === "pass",
        reason: state.reason,
        failureClass: state.failureClass,
        responseText: summarizeDispatch("Capability check_status", state),
        metadata: dispatchMetadata("check_status", "eve", state),
      };
    },
  );

  registry.register(
    {
      id: "eve_dispatch_task",
      description: "Execute Eve task dispatch command wrapper.",
      owner: "eve",
      aliases: ["dispatch_task"],
    },
    async (context) => {
      const task = context.argsText.trim();
      if (!task) {
        return missingArgsResult("eve_dispatch_task");
      }
      const state = await dispatchLane(
        "eve",
        task,
        "capability:eve_dispatch_task",
        context.chatId,
        context.messageId,
        context.traceId,
      );
      return {
        consumed: state.status === "pass",
        reason: state.reason,
        failureClass: state.failureClass,
        responseText: summarizeDispatch("Capability eve_dispatch_task", state),
        metadata: dispatchMetadata("eve_dispatch_task", "eve", state),
      };
    },
  );

  registry.register(
    {
      id: "summarize_state",
      description: "Summarize runtime state via Hermes lane.",
      owner: "hermes",
      aliases: ["summarize", "state_summary"],
    },
    async (context) => {
      const summarizeText = context.argsText.trim() || "summarize state";
      const state = await dispatchLane(
        "hermes",
        summarizeText,
        "capability:summarize_state",
        context.chatId,
        context.messageId,
        context.traceId,
      );
      const recent = await context.memoryStore.list({
        lane: "hermes",
        namespace: "capability-execution",
        ...(context.tenantId?.trim() ? { tenantId: context.tenantId.trim() } : {}),
      });
      return {
        consumed: state.status === "pass",
        reason: state.reason,
        failureClass: state.failureClass,
        responseText: `${summarizeDispatch("Capability summarize_state", state)} Recent hermes capability records: ${recent.length}.`,
        metadata: {
          ...dispatchMetadata("summarize_state", "hermes", state),
          recentRecords: String(recent.length),
        },
      };
    },
  );

  registry.register(
    {
      id: "hermes_dispatch_task",
      description: "Execute Hermes gateway command.",
      owner: "hermes",
      aliases: ["dispatch_task"],
    },
    async (context) => {
      const task = context.argsText.trim();
      if (!task) {
        return missingArgsResult("hermes_dispatch_task");
      }
      const state = await dispatchLane(
        "hermes",
        task,
        "capability:hermes_dispatch_task",
        context.chatId,
        context.messageId,
        context.traceId,
      );
      return {
        consumed: state.status === "pass",
        reason: state.reason,
        failureClass: state.failureClass,
        responseText: summarizeDispatch("Capability hermes_dispatch_task", state),
        metadata: dispatchMetadata("hermes_dispatch_task", "hermes", state),
      };
    },
  );
}
