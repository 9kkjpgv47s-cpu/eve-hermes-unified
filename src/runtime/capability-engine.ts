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
import { TenantScopedUnifiedMemoryStore } from "../memory/tenant-scoped-memory-store.js";
import type { CapabilityPolicy } from "./capability-policy.js";
import { appendCapabilityPolicyAuditLog } from "./capability-policy-audit-log.js";

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
  /** Wall-clock budget for executor body; omit or 0 for no limit. */
  executionTimeoutMs?: number;
  /** When set, append JSONL capability policy authorization records (@cap) after each policy evaluation. */
  capabilityPolicyAuditLogPath?: string;
};

async function withCapabilityExecutorTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<{ ok: true; value: T } | { ok: false; timedOut: true }> {
  if (!timeoutMs || timeoutMs <= 0) {
    const value = await promise;
    return { ok: true, value };
  }
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      promise,
      new Promise<"__timeout__">((resolve) => {
        timeoutHandle = setTimeout(() => resolve("__timeout__"), timeoutMs);
      }),
    ]);
    if (value === "__timeout__") {
      return { ok: false, timedOut: true };
    }
    return { ok: true, value };
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

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
    const tenant = envelope.tenantId?.trim();
    const scopedMemory: UnifiedMemoryStore = tenant
      ? new TenantScopedUnifiedMemoryStore(this.dependencies.memoryStore, tenant)
      : this.dependencies.memoryStore;
    if (this.dependencies.policy) {
      const authorization = this.dependencies.policy.authorize({
        capabilityId: selection.id,
        lane: selection.lane,
        chatId: envelope.chatId,
        tenantId: envelope.tenantId,
      });
      const auditPath = this.dependencies.capabilityPolicyAuditLogPath?.trim();
      if (auditPath) {
        await appendCapabilityPolicyAuditLog(auditPath, {
          recordedAtIso: new Date().toISOString(),
          traceId: envelope.traceId,
          capabilityId: selection.id,
          lane: selection.lane,
          chatId: envelope.chatId,
          messageId: envelope.messageId,
          ...(envelope.tenantId?.trim() ? { tenantId: envelope.tenantId.trim() } : {}),
          ...(envelope.regionId?.trim() ? { regionId: envelope.regionId.trim() } : {}),
          allowed: authorization.allowed,
          policyReason: authorization.reason,
        });
      }
      if (!authorization.allowed) {
        const denied = denialExecutionResult(
          selection,
          envelope,
          started,
          authorization.reason ?? "capability_policy_denied",
        );
        await this.writeExecutionMemory(selection, envelope, denied, scopedMemory);
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
      await this.writeExecutionMemory(selection, envelope, missingResult, scopedMemory);
      return missingResult;
    }

    const parsed = parseExplicitCapabilityText(envelope.text);
    const argsText = parsed?.argsText ?? "";
    const timeoutMs = this.dependencies.executionTimeoutMs ?? 0;
    const executorPromise = Promise.resolve(
      executor({
        text: envelope.text,
        argsText,
        chatId: envelope.chatId,
        messageId: envelope.messageId,
        traceId: envelope.traceId,
        tenantId: envelope.tenantId,
        regionId: envelope.regionId,
        memoryStore: scopedMemory,
        dispatchLane: async (input) =>
          this.dependencies.dispatchLane({
            ...input,
            chatId: envelope.chatId,
            messageId: envelope.messageId,
            traceId: envelope.traceId,
            tenantId: envelope.tenantId,
            regionId: envelope.regionId,
          }),
      }),
    );
    const raced = await withCapabilityExecutorTimeout(executorPromise, timeoutMs);
    let execution: Awaited<typeof executorPromise>;
    if (!raced.ok) {
      execution = {
        consumed: false,
        reason: "capability_execution_timeout",
        responseText: `Capability '${selection.id}' exceeded execution budget (${timeoutMs}ms).`,
        failureClass: "policy_failure",
        metadata: {
          envelope: "capability_execution_timeout",
          timeoutMsBudget: String(timeoutMs),
        },
      };
    } else {
      execution = raced.value;
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
    await this.writeExecutionMemory(selection, envelope, normalized, scopedMemory);
    return normalized;
  }

  private async writeExecutionMemory(
    selection: CapabilityExecutionSelection,
    envelope: UnifiedMessageEnvelope,
    result: CapabilityExecutionResult,
    memoryStore: UnifiedMemoryStore,
  ): Promise<void> {
    await memoryStore.set(
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
