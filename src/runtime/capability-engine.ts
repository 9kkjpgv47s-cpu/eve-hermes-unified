import { randomUUID } from "node:crypto";
import type {
  CapabilityExecutionResult,
  DispatchState,
  FailureClass,
  LaneId,
  UnifiedCapabilityDecision,
  UnifiedMessageEnvelope,
} from "../contracts/types.js";
import {
  validateCapabilityDecision,
  validateCapabilityExecutionResult,
} from "../contracts/validate.js";
import type { RouterPolicyConfig } from "../router/policy-router.js";
import type {
  CapabilityLaneDispatcher,
  CapabilityRegistry,
} from "../skills/capability-registry.js";
import type { UnifiedMemoryStore } from "../memory/unified-memory-store.js";

export type CapabilityExecutionSelection = UnifiedCapabilityDecision;

export interface CapabilityEngine {
  select(
    envelope: UnifiedMessageEnvelope,
    routerConfig: RouterPolicyConfig,
  ): CapabilityExecutionSelection | undefined;
  execute(
    selection: CapabilityExecutionSelection,
    envelope: UnifiedMessageEnvelope,
  ): Promise<CapabilityExecutionResult>;
}

export type DispatchLaneResult = DispatchState;

export type CapabilityExecutionDependencies = {
  memoryStore: UnifiedMemoryStore;
  dispatchLane: CapabilityLaneDispatcher;
};

function parseExplicitCapabilityText(text: string): { capabilityId: string; argsText: string } | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith("@cap ")) {
    return undefined;
  }
  const raw = trimmed.slice(5).trim();
  if (!raw) {
    return undefined;
  }
  const [first, ...rest] = raw.split(/\s+/);
  if (!first) {
    return undefined;
  }
  return {
    capabilityId: first.toLowerCase(),
    argsText: rest.join(" ").trim(),
  };
}

function laneFromOwner(owner: "eve" | "hermes" | "shared", fallback: "eve" | "hermes"): "eve" | "hermes" {
  if (owner === "shared") {
    return fallback;
  }
  return owner;
}

function resultReason(capabilityId: string, status: "pass" | "failed"): string {
  return status === "pass" ? `capability_${capabilityId}_success` : `capability_${capabilityId}_failed`;
}

export class UnifiedCapabilityEngine implements CapabilityEngine {
  constructor(
    private readonly registry: CapabilityRegistry,
    private readonly dependencies: CapabilityExecutionDependencies,
  ) {}

  select(
    envelope: UnifiedMessageEnvelope,
    routerConfig: RouterPolicyConfig,
  ): CapabilityExecutionSelection | undefined {
    const parsed = parseExplicitCapabilityText(envelope.text);
    if (!parsed) {
      return undefined;
    }
    const capability = this.registry.get(parsed.capabilityId) ?? this.registry.findByAlias(parsed.capabilityId);
    if (!capability) {
      return undefined;
    }
    return validateCapabilityDecision({
      id: capability.id,
      lane: laneFromOwner(capability.owner, routerConfig.defaultPrimary),
      routeReason: "explicit_capability_command",
    });
  }

  async execute(
    selection: CapabilityExecutionSelection,
    envelope: UnifiedMessageEnvelope,
  ): Promise<CapabilityExecutionResult> {
    const started = Date.now();
    const executor = this.registry.getExecutor(selection.id);
    if (!executor) {
      const missingResult = validateCapabilityExecutionResult({
        capability: selection,
        status: "failed",
        consumed: false,
        reason: "capability_executor_missing",
        outputText: `Capability '${selection.id}' has no registered executor.`,
        failureClass: "dispatch_failure",
        runId: `capability-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
        elapsedMs: Math.max(0, Date.now() - started),
      });
      await this.writeExecutionMemory(selection, envelope, missingResult);
      return missingResult;
    }

    const parsed = parseExplicitCapabilityText(envelope.text);
    const argsText = parsed?.argsText ?? "";
    const execution = await executor({
      text: envelope.text,
      argsText,
      chatId: envelope.chatId,
      messageId: envelope.messageId,
      traceId: envelope.traceId,
      memoryStore: this.dependencies.memoryStore,
      dispatchLane: async (input) =>
        this.dependencies.dispatchLane({
          ...input,
          chatId: envelope.chatId,
          messageId: envelope.messageId,
          traceId: envelope.traceId,
        }),
    });
    const status: "pass" | "failed" = execution.consumed ? "pass" : "failed";
    const reason = execution.reason?.trim() || resultReason(selection.id, status);
    const failureClass =
      status === "pass" ? "none" : execution.failureClass ?? "dispatch_failure";
    const normalized = validateCapabilityExecutionResult({
      capability: selection,
      status,
      consumed: execution.consumed,
      reason,
      outputText: execution.responseText,
      failureClass,
      runId: `capability-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
      elapsedMs: Math.max(0, Date.now() - started),
      metadata: execution.metadata,
    });
    await this.writeExecutionMemory(selection, envelope, normalized);
    return normalized;
  }

  private async writeExecutionMemory(
    selection: CapabilityExecutionSelection,
    envelope: UnifiedMessageEnvelope,
    result: CapabilityExecutionResult,
  ): Promise<void> {
    await this.dependencies.memoryStore.set(
      {
        lane: selection.lane,
        namespace: "capability-execution",
        key: envelope.traceId,
      },
      JSON.stringify({
        capabilityId: selection.id,
        lane: selection.lane,
        traceId: envelope.traceId,
        chatId: envelope.chatId,
        messageId: envelope.messageId,
        status: result.status,
        reason: result.reason,
      }),
      { source: "capability-engine" },
    );
  }
}
