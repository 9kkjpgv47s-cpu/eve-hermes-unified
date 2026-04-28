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
import { stampUnifiedDispatchContract } from "../contracts/dispatch-contract.js";
import {
  validateCapabilityDecision,
  validateCapabilityExecutionResult,
  validateDispatchState,
  validateEnvelope,
  validateRoutingDecision,
  validateUnifiedResponse,
} from "../contracts/validate.js";
import type { LaneAdapter } from "../adapters/lane-adapter.js";
import { routeMessage, mergeRegionRouting, type RouterPolicyConfig } from "../router/policy-router.js";
import type { CapabilityEngine } from "./capability-engine.js";

export type UnifiedRuntime = {
  eveAdapter: LaneAdapter;
  hermesAdapter: LaneAdapter;
  routerConfig: RouterPolicyConfig;
  capabilityEngine?: CapabilityEngine;
  /** H5: applied when envelope omits tenantId/regionId. */
  dispatchDefaults?: {
    defaultTenantId?: string;
    defaultRegionId?: string;
  };
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

function failureClassAllowsFallback(
  failureClass: FailureClass,
  allowlist: FailureClass[] | undefined,
): boolean {
  if (!allowlist || allowlist.length === 0) {
    return true;
  }
  return allowlist.includes(failureClass);
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
    primaryFallbackLimited?: boolean;
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

  return stampUnifiedDispatchContract({
    envelope,
    routing,
    primaryState,
    fallbackState: options?.fallbackState,
    fallbackInfo,
    primaryFallbackLimited: options?.primaryFallbackLimited,
    capabilityDecision,
    capabilityExecution,
    response,
  });
}

export async function dispatchUnifiedMessage(
  runtime: UnifiedRuntime,
  input: Omit<UnifiedMessageEnvelope, "traceId" | "receivedAtIso">,
): Promise<UnifiedDispatchResult> {
  const tenantFromInput = input.tenantId?.trim();
  const tenantFromDefaults = runtime.dispatchDefaults?.defaultTenantId?.trim();
  const tenantId =
    tenantFromInput && tenantFromInput.length > 0
      ? tenantFromInput
      : tenantFromDefaults && tenantFromDefaults.length > 0
        ? tenantFromDefaults
        : undefined;

  const regionFromInput = input.regionId?.trim();
  const regionFromDefaults = runtime.dispatchDefaults?.defaultRegionId?.trim();
  const regionId =
    regionFromInput && regionFromInput.length > 0
      ? regionFromInput
      : regionFromDefaults && regionFromDefaults.length > 0
        ? regionFromDefaults
        : undefined;

  const envelope = validateEnvelope({
    ...input,
    tenantId,
    regionId,
    traceId: `unified-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`,
    receivedAtIso: new Date().toISOString(),
  });

  if (runtime.capabilityEngine) {
    const capabilityDecision = runtime.capabilityEngine.select(envelope, runtime.routerConfig);
    if (capabilityDecision) {
      const validatedDecision = validateCapabilityDecision(capabilityDecision);
      const executed = await runtime.capabilityEngine.execute(validatedDecision, envelope);
      const validatedExecution = validateCapabilityExecutionResult(executed);
      const capabilityState = toDispatchStateFromCapability(validatedDecision, validatedExecution, envelope);
      const routing = mergeRegionRouting(
        envelope,
        runtime.routerConfig,
        validateRoutingDecision({
          primaryLane: validatedDecision.lane,
          fallbackLane: "none",
          reason: validatedDecision.routeReason,
          policyVersion: runtime.routerConfig.policyVersion,
          failClosed: true,
        }),
      );
      return buildResult(envelope, routing, capabilityState, capabilityState, {
        capabilityDecision: validatedDecision,
        capabilityExecution: validatedExecution,
      });
    }
  }

  const routing = routeMessage(envelope, runtime.routerConfig);
  const primary = getLaneAdapter(runtime, routing.primaryLane);
  const primaryState = withCanonicalTraceId(
    await primary.dispatch({
      envelope,
      intentRoute: `unified:${routing.reason}`,
    }),
    envelope.traceId,
  );
  const allowlist = runtime.routerConfig.dispatchFailureClassesAllowingFallback;
  const fallbackAllowed =
    primaryState.status !== "pass" &&
    routing.fallbackLane !== "none" &&
    !routing.failClosed &&
    failureClassAllowsFallback(primaryState.failureClass, allowlist);

  if (primaryState.status === "pass" || routing.fallbackLane === "none" || routing.failClosed) {
    return buildResult(envelope, routing, primaryState, primaryState);
  }

  if (!fallbackAllowed) {
    return buildResult(envelope, routing, primaryState, primaryState, {
      primaryFallbackLimited: true,
    });
  }

  const fallback = getLaneAdapter(runtime, routing.fallbackLane);
  const fallbackState = withCanonicalTraceId(
    await fallback.dispatch({
      envelope,
      intentRoute: `unified:fallback_after_${routing.reason}`,
    }),
    envelope.traceId,
  );
  return buildResult(envelope, routing, primaryState, fallbackState, {
    fallbackState,
    fallbackInfo: {
      attempted: true,
      reason: "primary_failed",
      fromLane: primaryState.sourceLane,
      toLane: fallbackState.sourceLane,
    },
  });
}
