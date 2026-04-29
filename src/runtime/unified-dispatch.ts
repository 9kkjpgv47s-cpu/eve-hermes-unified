import { randomUUID } from "node:crypto";
import type {
  CapabilityExecutionResult,
  DispatchFallbackInfo,
  DispatchState,
  FailureClass,
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

export type UnifiedRuntime = {
  eveAdapter: LaneAdapter;
  hermesAdapter: LaneAdapter;
  routerConfig: RouterPolicyConfig;
  capabilityEngine?: CapabilityEngine;
  /** When non-empty, envelopes without a matching tenantId are rejected before routing. */
  tenantAllowlist?: string[];
  tenantDenylist?: string[];
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

function shouldSkipFallback(
  routing: RoutingDecision,
  primaryFailureClass: FailureClass,
  routerConfig: RouterPolicyConfig,
): boolean {
  if (routing.fallbackLane === "none" || routing.failClosed) {
    return true;
  }
  const suppressed = routerConfig.noFallbackOnFailureClasses;
  if (!suppressed?.length) {
    return false;
  }
  return suppressed.includes(primaryFailureClass);
}

function evaluateTenantDispatchPolicy(
  envelope: UnifiedMessageEnvelope,
  allowlist: string[] | undefined,
  denylist: string[] | undefined,
): { ok: true } | { ok: false; reason: string } {
  const tenant = envelope.tenantId?.trim() ?? "";
  const denied = new Set((denylist ?? []).map((item) => item.trim()).filter(Boolean));
  if (tenant && denied.has(tenant)) {
    return { ok: false, reason: "tenant_denied_by_dispatch_policy" };
  }
  const allowed = (allowlist ?? []).map((item) => item.trim()).filter(Boolean);
  if (allowed.length > 0 && (!tenant || !allowed.includes(tenant))) {
    return { ok: false, reason: "tenant_not_allowlisted_for_dispatch" };
  }
  return { ok: true };
}

function tenantPolicyFailureResult(
  envelope: UnifiedMessageEnvelope,
  routerConfig: RouterPolicyConfig,
  reason: string,
): UnifiedDispatchResult {
  const routing = validateRoutingDecision({
    primaryLane: routerConfig.defaultPrimary,
    fallbackLane: "none",
    reason,
    policyVersion: routerConfig.policyVersion,
    failClosed: true,
  });
  const primaryState = validateDispatchState({
    status: "failed",
    reason,
    runtimeUsed: "unified-dispatch",
    runId: `tenant-policy-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
    elapsedMs: 0,
    failureClass: "policy_failure",
    sourceLane: routerConfig.defaultPrimary,
    sourceChatId: envelope.chatId,
    sourceMessageId: envelope.messageId,
    traceId: envelope.traceId,
  });
  return buildResult(envelope, routing, primaryState, primaryState);
}

export function createUnifiedEnvelopeForDispatch(
  input: Omit<UnifiedMessageEnvelope, "traceId" | "receivedAtIso">,
): UnifiedMessageEnvelope {
  return validateEnvelope({
    ...input,
    traceId: `unified-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`,
    receivedAtIso: new Date().toISOString(),
  });
}

export async function dispatchUnifiedEnvelope(
  runtime: UnifiedRuntime,
  envelope: UnifiedMessageEnvelope,
): Promise<UnifiedDispatchResult> {
  const validated = validateEnvelope(envelope);

  const tenantPolicy = evaluateTenantDispatchPolicy(
    validated,
    runtime.tenantAllowlist,
    runtime.tenantDenylist,
  );
  if (!tenantPolicy.ok) {
    return tenantPolicyFailureResult(validated, runtime.routerConfig, tenantPolicy.reason);
  }

  if (runtime.capabilityEngine) {
    const capabilityDecision = runtime.capabilityEngine.select(validated, runtime.routerConfig);
    if (capabilityDecision) {
      const validatedDecision = validateCapabilityDecision(capabilityDecision);
      const executed = await runtime.capabilityEngine.execute(validatedDecision, validated);
      const validatedExecution = validateCapabilityExecutionResult(executed);
      const capabilityState = toDispatchStateFromCapability(validatedDecision, validatedExecution, validated);
      const routing: RoutingDecision = {
        primaryLane: validatedDecision.lane,
        fallbackLane: "none",
        reason: validatedDecision.routeReason,
        policyVersion: runtime.routerConfig.policyVersion,
        failClosed: true,
      };
      const result = buildResult(validated, routing, capabilityState, capabilityState, {
        capabilityDecision: validatedDecision,
        capabilityExecution: validatedExecution,
      });
      return result;
    }
  }

  const routing = routeMessage(validated, runtime.routerConfig);
  const primary = getLaneAdapter(runtime, routing.primaryLane);
  const primaryState = withCanonicalTraceId(
    await primary.dispatch({
      envelope: validated,
      intentRoute: `unified:${routing.reason}`,
    }),
    validated.traceId,
  );
  if (
    primaryState.status === "pass" ||
    shouldSkipFallback(routing, primaryState.failureClass, runtime.routerConfig)
  ) {
    return buildResult(validated, routing, primaryState, primaryState);
  }

  const fallbackLane = routing.fallbackLane;
  if (fallbackLane === "none") {
    return buildResult(validated, routing, primaryState, primaryState);
  }

  const fallback = getLaneAdapter(runtime, fallbackLane);
  const fallbackState = withCanonicalTraceId(
    await fallback.dispatch({
      envelope: validated,
      intentRoute: `unified:fallback_after_${routing.reason}`,
    }),
    validated.traceId,
  );
  const result = buildResult(validated, routing, primaryState, fallbackState, {
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

export async function dispatchUnifiedMessage(
  runtime: UnifiedRuntime,
  input: Omit<UnifiedMessageEnvelope, "traceId" | "receivedAtIso">,
): Promise<UnifiedDispatchResult> {
  const envelope = createUnifiedEnvelopeForDispatch(input);
  return dispatchUnifiedEnvelope(runtime, envelope);
}
