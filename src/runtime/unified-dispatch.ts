import { randomUUID } from "node:crypto";
import type {
  CapabilityExecutionResult,
  DispatchFallbackInfo,
  DispatchState,
  LaneId,
  RoutingDecision,
  UnifiedCapabilityDecision,
  UnifiedDispatchResult,
  UnifiedMessageEnvelope,
  UnifiedResponse,
} from "../contracts/types.js";
import {
  validateCapabilityDecision,
  validateCapabilityExecutionResult,
  validateDispatchState,
  validateEnvelope,
  validateRoutingDecision,
  validateUnifiedResponse,
} from "../contracts/validate.js";
import type { LaneAdapter } from "../adapters/lane-adapter.js";
import { routeMessage, type RouterPolicyConfig } from "../router/policy-router.js";
import type { CapabilityEngine } from "./capability-engine.js";
import { TenantScopedMemoryStore } from "../memory/tenant-scoped-memory-store.js";
import type { UnifiedMemoryStore } from "../memory/unified-memory-store.js";
import { normalizeValidatedTenantId, resolveEnvelopeTenantId } from "./tenant-scope.js";

export type UnifiedRuntime = {
  eveAdapter: LaneAdapter;
  hermesAdapter: LaneAdapter;
  routerConfig: RouterPolicyConfig;
  capabilityEngine?: CapabilityEngine;
  /** When set, primary/fallback lane dispatch receives this signal for cooperative subprocess cancel. */
  abortSignal?: AbortSignal;
  /** Shared memory store (non-tenant); capability execution may use a tenant-scoped view. */
  memoryStore?: UnifiedMemoryStore;
  /** When true, reject if resolved tenant id is empty. */
  tenantStrict?: boolean;
  /** When non-empty, reject if resolved tenant is not in this set (normalized). */
  tenantAllowlist?: string[];
  /**
   * When true with memoryStore set, require a valid tenant and scope capability memory
   * (no shared-namespace capability reads/writes without tenant prefix).
   */
  tenantMemoryIsolation?: boolean;
};

export function laneAdapterFor(runtime: UnifiedRuntime, lane: LaneId): LaneAdapter {
  return lane === "eve" ? runtime.eveAdapter : runtime.hermesAdapter;
}

function getLaneAdapter(runtime: UnifiedRuntime, lane: LaneId): LaneAdapter {
  return laneAdapterFor(runtime, lane);
}

function responseFromState(state: DispatchState, traceId: string): UnifiedResponse {
  return {
    consumed: true,
    responseText:
      state.status === "pass"
        ? `Unified dispatch succeeded via ${state.sourceLane}.\nrun_id: ${state.runId}\nreason: ${state.reason}`
        : `Unified dispatch failed via ${state.sourceLane}.\nrun_id: ${state.runId}\nreason: ${state.reason}`,
    failureClass: state.failureClass,
    laneUsed: state.sourceLane,
    traceId,
  };
}

function withCanonicalTraceId(state: DispatchState, traceId: string): DispatchState {
  return validateDispatchState({ ...state, traceId });
}

function toDispatchStateFromCapability(
  capabilityDecision: UnifiedCapabilityDecision,
  result: CapabilityExecutionResult,
  envelope: UnifiedMessageEnvelope,
): DispatchState {
  return validateDispatchState({
    status: result.status,
    reason: result.reason,
    runtimeUsed: "capability-engine",
    runId: result.runId,
    elapsedMs: result.elapsedMs,
    failureClass: result.failureClass,
    sourceLane: capabilityDecision.lane,
    sourceChatId: envelope.chatId,
    sourceMessageId: envelope.messageId,
    traceId: envelope.traceId,
  });
}

function failClosedTenantState(
  envelope: UnifiedMessageEnvelope,
  reason: string,
  primaryLane: LaneId,
  policyVersion: string,
): UnifiedDispatchResult {
  const failedState = validateDispatchState({
    status: "failed",
    reason,
    runtimeUsed: "unified-dispatch",
    runId: `tenant-gate-${randomUUID().slice(0, 8)}`,
    elapsedMs: 0,
    failureClass: "policy_failure",
    sourceLane: primaryLane,
    sourceChatId: envelope.chatId,
    sourceMessageId: envelope.messageId,
    traceId: envelope.traceId,
  });
  const routing = validateRoutingDecision({
    primaryLane,
    fallbackLane: "none",
    reason: "tenant_gate",
    policyVersion,
    failClosed: true,
  });
  return buildResult(envelope, routing, failedState, failedState);
}

function buildResult(
  envelope: UnifiedMessageEnvelope,
  routing: RoutingDecision,
  primaryState: DispatchState,
  responseState: DispatchState,
  options?: {
    fallbackState?: DispatchState;
    fallbackInfo?: DispatchFallbackInfo;
    capabilityDecision?: UnifiedCapabilityDecision;
    capabilityExecution?: CapabilityExecutionResult;
  },
): UnifiedDispatchResult {
  const response = validateUnifiedResponse(responseFromState(responseState, envelope.traceId));
  const fallbackInfo = options?.fallbackInfo;
  const capabilityDecision = options?.capabilityDecision;
  const capabilityExecution = options?.capabilityExecution;

  if (capabilityDecision) {
    validateCapabilityDecision(capabilityDecision);
  }
  if (capabilityExecution) {
    validateCapabilityExecutionResult(capabilityExecution);
  }

  return {
    envelope,
    routing,
    primaryState,
    fallbackState: options?.fallbackState,
    fallbackInfo,
    capabilityDecision,
    capabilityExecution,
    response,
  };
}

export async function dispatchUnifiedMessage(
  runtime: UnifiedRuntime,
  input: Omit<UnifiedMessageEnvelope, "traceId" | "receivedAtIso">,
): Promise<UnifiedDispatchResult> {
  const envelope = validateEnvelope({
    ...input,
    traceId: `unified-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`,
    receivedAtIso: new Date().toISOString(),
  });

  const policyVersion = runtime.routerConfig.policyVersion;
  const rawTenant = resolveEnvelopeTenantId(envelope);
  const normalizedTenant = normalizeValidatedTenantId(rawTenant);
  if (normalizedTenant === undefined && rawTenant.trim().length > 0) {
    return failClosedTenantState(
      envelope,
      "tenant_id_invalid",
      runtime.routerConfig.defaultPrimary,
      policyVersion,
    );
  }
  if (runtime.tenantStrict === true && !normalizedTenant) {
    return failClosedTenantState(
      envelope,
      "tenant_id_required",
      runtime.routerConfig.defaultPrimary,
      policyVersion,
    );
  }
  const allow = runtime.tenantAllowlist ?? [];
  if (allow.length > 0 && !normalizedTenant) {
    return failClosedTenantState(
      envelope,
      "tenant_id_required",
      runtime.routerConfig.defaultPrimary,
      policyVersion,
    );
  }
  if (allow.length > 0 && normalizedTenant && !allow.includes(normalizedTenant)) {
    return failClosedTenantState(
      envelope,
      "tenant_id_not_allowed",
      runtime.routerConfig.defaultPrimary,
      policyVersion,
    );
  }

  if (
    runtime.tenantMemoryIsolation === true &&
    runtime.memoryStore &&
    !normalizedTenant
  ) {
    return failClosedTenantState(
      envelope,
      "tenant_id_required_for_memory_isolation",
      runtime.routerConfig.defaultPrimary,
      policyVersion,
    );
  }

  const tenantMemory =
    runtime.memoryStore && normalizedTenant
      ? new TenantScopedMemoryStore(runtime.memoryStore, normalizedTenant)
      : runtime.memoryStore;

  if (runtime.capabilityEngine) {
    const capabilityDecision = runtime.capabilityEngine.select(envelope, runtime.routerConfig);
    if (capabilityDecision) {
      const validatedDecision = validateCapabilityDecision(capabilityDecision);
      const executed = await runtime.capabilityEngine.execute(validatedDecision, envelope, {
        memoryStore: tenantMemory,
      });
      const validatedExecution = validateCapabilityExecutionResult(executed);
      const capabilityState = toDispatchStateFromCapability(validatedDecision, validatedExecution, envelope);
      const routing = validateRoutingDecision({
        primaryLane: validatedDecision.lane,
        fallbackLane: "none",
        reason: validatedDecision.routeReason,
        policyVersion,
        failClosed: true,
      });
      const result = buildResult(envelope, routing, capabilityState, capabilityState, {
        capabilityDecision: validatedDecision,
        capabilityExecution: validatedExecution,
      });
      return result;
    }
  }

  const routing = routeMessage(envelope, runtime.routerConfig);
  const primary = getLaneAdapter(runtime, routing.primaryLane);
  const primaryState = withCanonicalTraceId(
    await primary.dispatch({
      envelope,
      intentRoute: `unified:${routing.reason}`,
      signal: runtime.abortSignal,
    }),
    envelope.traceId,
  );
  if (primaryState.status === "pass" || routing.fallbackLane === "none" || routing.failClosed) {
    return buildResult(envelope, routing, primaryState, primaryState);
  }

  const fallback = getLaneAdapter(runtime, routing.fallbackLane);
  const fallbackState = withCanonicalTraceId(
    await fallback.dispatch({
      envelope,
      intentRoute: `unified:fallback_after_${routing.reason}`,
      signal: runtime.abortSignal,
    }),
    envelope.traceId,
  );
  const result = buildResult(envelope, routing, primaryState, fallbackState, {
    fallbackState,
    fallbackInfo: {
      attempted: true,
      reason: "primary_failed",
      fromLane: primaryState.sourceLane,
      toLane: fallbackState.sourceLane,
    },
  });
  return result;
}
