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
import type { CapabilityPolicy } from "./capability-policy.js";

export type CapabilityExecutionSelection = UnifiedCapabilityDecision;

export interface CapabilityEngine {
  select(
    envelope: UnifiedMessageEnvelope,
    routerConfig: RouterPolicyConfig,
  ): CapabilityExecutionSelection | undefined;
  execute(
    selection: CapabilityExecutionSelection,
    envelope: UnifiedMessageEnvelope,
    options?: { memoryStore?: UnifiedMemoryStore },
  ): Promise<CapabilityExecutionResult>;
}

export type DispatchLaneResult = DispatchState;

export type CapabilityPolicyDenialAuditHook = (input: {
  traceId: string;
  chatId: string;
  messageId: string;
  capabilityId: string;
  lane: LaneId;
  policyReason: string;
  policyFingerprintSha256: string;
  envelope: UnifiedMessageEnvelope;
}) => void | Promise<void>;

export type CapabilityExecutionDependencies = {
  memoryStore: UnifiedMemoryStore;
  dispatchLane: CapabilityLaneDispatcher;
  policy?: CapabilityPolicy;
  /** SHA-256 of stable JSON capability policy config; used for audit trail. */
  policyFingerprintSha256?: string;
  /** When set, invoked after a policy denial (before execution memory write). */
  onPolicyDenial?: CapabilityPolicyDenialAuditHook;
  /** When > 0, reject capability handler if it exceeds this duration (ms). */
  executionTimeoutMs?: number;
  /** When true with executionTimeoutMs, SIGTERM in-flight lane subprocess on budget expiry. */
  abortLaneOnCapabilityTimeout?: boolean;
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
    options?: { memoryStore?: UnifiedMemoryStore },
  ): Promise<CapabilityExecutionResult> {
    const started = Date.now();
    const memoryStore = options?.memoryStore ?? this.dependencies.memoryStore;
    if (this.dependencies.policy) {
      const authorization = this.dependencies.policy.authorize({
        capabilityId: selection.id,
        lane: selection.lane,
        chatId: envelope.chatId,
      });
      if (!authorization.allowed) {
        const fp = this.dependencies.policyFingerprintSha256 ?? "";
        if (this.dependencies.onPolicyDenial && fp.length > 0) {
          await this.dependencies.onPolicyDenial({
            traceId: envelope.traceId,
            chatId: envelope.chatId,
            messageId: envelope.messageId,
            capabilityId: selection.id,
            lane: selection.lane,
            policyReason: authorization.reason ?? "capability_policy_denied",
            policyFingerprintSha256: fp,
            envelope,
          });
        }
        const denied = denialExecutionResult(
          selection,
          envelope,
          started,
          authorization.reason ?? "capability_policy_denied",
        );
        await this.writeExecutionMemory(selection, envelope, denied, memoryStore);
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
      await this.writeExecutionMemory(selection, envelope, missingResult, memoryStore);
      return missingResult;
    }

    const parsed = parseExplicitCapabilityText(envelope.text);
    const argsText = parsed?.argsText ?? "";
    const timeoutMs = this.dependencies.executionTimeoutMs ?? 0;
    const abortLaneOnTimeout = this.dependencies.abortLaneOnCapabilityTimeout === true;
    let execution: CapabilityExecutorPayload;
    if (timeoutMs > 0) {
      const runAbort = new AbortController();
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
          envelope,
          signal: abortLaneOnTimeout ? runAbort.signal : undefined,
          memoryStore,
          dispatchLane: async (input) =>
            this.dependencies.dispatchLane({
              ...input,
              signal: abortLaneOnTimeout ? (input.signal ?? runAbort.signal) : input.signal,
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
        if (abortLaneOnTimeout) {
          runAbort.abort();
          await runPromise.catch(() => undefined);
        }
        const timedOut = validateCapabilityExecutionResult({
          capability: selection,
          status: "failed",
          consumed: false,
          reason: "capability_execution_timeout",
          outputText: `Capability '${selection.id}' exceeded execution budget (${timeoutMs}ms).`,
          failureClass: "dispatch_failure",
          runId: `capability-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
          elapsedMs: Math.max(0, Date.now() - started),
          metadata: {
            budgetMs: String(timeoutMs),
            laneAbort: abortLaneOnTimeout ? "1" : "0",
          },
        });
        await this.writeExecutionMemory(selection, envelope, timedOut, memoryStore);
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
          envelope,
          memoryStore,
          dispatchLane: async (input) =>
            this.dependencies.dispatchLane({
              ...input,
              signal: input.signal,
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
    await this.writeExecutionMemory(selection, envelope, normalized, memoryStore);
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
