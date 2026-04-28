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

function shouldSkipFallback(
  routing: RoutingDecision,
  routerConfig: RouterPolicyConfig,
  primaryState: DispatchState,
): boolean {
  if (primaryState.status === "pass" || routing.fallbackLane === "none" || routing.failClosed) {
    return true;
  }
  const blocked = routerConfig.noFallbackOnFailureClasses;
  if (!blocked?.length) {
    return false;
  }
  const set = new Set<FailureClass>(blocked);
  return set.has(primaryState.failureClass);
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
  if (shouldSkipFallback(routing, runtime.routerConfig, primaryState)) {
    return buildResult(validated, routing, primaryState, primaryState);
  }

  if (routing.fallbackLane === "none") {
    return buildResult(validated, routing, primaryState, primaryState);
  }

  const fallback = getLaneAdapter(runtime, routing.fallbackLane);
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
  return dispatchUnifiedEnvelope(runtime, createUnifiedEnvelopeForDispatch(input));
}
