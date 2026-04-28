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
  CapabilityExecutionResult as CapabilityExecutorPayload,
  CapabilityLaneDispatcher,
  CapabilityRegistry,
} from "../skills/capability-registry.js";
import type { UnifiedMemoryStore } from "../memory/unified-memory-store.js";
import { TenantScopedMemoryStore } from "../memory/tenant-scoped-memory-store.js";
import type { CapabilityPolicy } from "./capability-policy.js";
import { resolveEnvelopeTenantId } from "./tenant-scope.js";

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
  policy?: CapabilityPolicy;
  /** When > 0, fail capability execution if the handler does not settle within this many ms. */
  executionTimeoutMs?: number;
  /** Optional hook when policy denies a capability (e.g. append-only audit). */
  onPolicyDenial?: (payload: {
    capabilityId: string;
    lane: "eve" | "hermes";
    chatId: string;
    reason: string;
  }) => Promise<void>;
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

function denialExecutionResult(
  selection: CapabilityExecutionSelection,
  envelope: UnifiedMessageEnvelope,
  started: number,
  reason: string,
): CapabilityExecutionResult {
  return validateCapabilityExecutionResult({
    capability: selection,
    status: "failed",
    consumed: false,
    reason,
    outputText: `Capability '${selection.id}' is not allowed for chat ${envelope.chatId}.`,
    failureClass: "policy_failure",
    runId: `capability-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
    elapsedMs: Math.max(0, Date.now() - started),
    metadata: {
      policy: "capability-access-control",
      deniedChatId: envelope.chatId,
    },
  });
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
    if (this.dependencies.policy) {
      const authorization = this.dependencies.policy.authorize({
        capabilityId: selection.id,
        lane: selection.lane,
        chatId: envelope.chatId,
      });
      if (!authorization.allowed) {
        const reason = authorization.reason ?? "capability_policy_denied";
        if (this.dependencies.onPolicyDenial) {
          try {
            await this.dependencies.onPolicyDenial({
              capabilityId: selection.id,
              lane: selection.lane,
              chatId: envelope.chatId,
              reason,
            });
          } catch {
            // audit must not block denial path
          }
        }
        const denied = denialExecutionResult(
          selection,
          envelope,
          started,
          reason,
        );
        await this.writeExecutionMemory(selection, envelope, denied);
        return denied;
      }
    }

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
    const tenantId = resolveEnvelopeTenantId(envelope);
    const resolvedTenant = tenantId || undefined;
    const timeoutMs = this.dependencies.executionTimeoutMs ?? 0;
    let execution: CapabilityExecutorPayload;
    if (timeoutMs > 0) {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<"__timeout__">((resolve) => {
        timeoutId = setTimeout(() => resolve("__timeout__"), timeoutMs);
      });
      const runPromise = Promise.resolve(
        executor({
          text: envelope.text,
          argsText,
          chatId: envelope.chatId,
          messageId: envelope.messageId,
          traceId: envelope.traceId,
          tenantId: resolvedTenant,
          memoryStore: this.resolveMemoryStore(envelope),
          dispatchLane: async (input) =>
            this.dependencies.dispatchLane({
              ...input,
              chatId: envelope.chatId,
              messageId: envelope.messageId,
              traceId: envelope.traceId,
              tenantId: input.tenantId ?? resolvedTenant,
            }),
        }),
      );
      let outcome: { kind: "ok"; value: CapabilityExecutorPayload } | { kind: "timeout" };
      try {
        outcome = await Promise.race([
          runPromise.then((value) => ({ kind: "ok" as const, value })),
          timeoutPromise.then(() => ({ kind: "timeout" as const })),
        ]);
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
      if (outcome.kind === "timeout") {
        const timedOut = validateCapabilityExecutionResult({
          capability: selection,
          status: "failed",
          consumed: false,
          reason: "capability_execution_timeout",
          outputText: `Capability '${selection.id}' exceeded execution budget (${timeoutMs}ms).`,
          failureClass: "dispatch_failure",
          runId: `capability-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
          elapsedMs: Math.max(0, Date.now() - started),
          metadata: { budgetMs: String(timeoutMs) },
        });
        await this.writeExecutionMemory(selection, envelope, timedOut);
        return timedOut;
      }
      execution = outcome.value;
    } else {
      execution = await Promise.resolve(
        executor({
          text: envelope.text,
          argsText,
          chatId: envelope.chatId,
          messageId: envelope.messageId,
          traceId: envelope.traceId,
          tenantId: resolvedTenant,
          memoryStore: this.resolveMemoryStore(envelope),
          dispatchLane: async (input) =>
            this.dependencies.dispatchLane({
              ...input,
              chatId: envelope.chatId,
              messageId: envelope.messageId,
              traceId: envelope.traceId,
              tenantId: input.tenantId ?? resolvedTenant,
            }),
        }),
      );
    }
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

  private resolveMemoryStore(envelope: UnifiedMessageEnvelope): UnifiedMemoryStore {
    const tid = resolveEnvelopeTenantId(envelope);
    if (!tid) {
      return this.dependencies.memoryStore;
    }
    return new TenantScopedMemoryStore(this.dependencies.memoryStore, tid);
  }

  private async writeExecutionMemory(
    selection: CapabilityExecutionSelection,
    envelope: UnifiedMessageEnvelope,
    result: CapabilityExecutionResult,
  ): Promise<void> {
    await this.resolveMemoryStore(envelope).set(
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
