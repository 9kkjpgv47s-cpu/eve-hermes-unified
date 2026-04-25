import { randomUUID } from "node:crypto";
import type {
  DispatchState,
  LaneId,
  RoutingDecision,
  UnifiedDispatchResult,
  UnifiedMessageEnvelope,
  UnifiedResponse,
} from "../contracts/types.js";
import { validateEnvelope, validateUnifiedResponse } from "../contracts/validate.js";
import type { LaneAdapter } from "../adapters/lane-adapter.js";
import { routeMessage, type RouterPolicyConfig } from "../router/policy-router.js";

export type UnifiedRuntime = {
  eveAdapter: LaneAdapter;
  hermesAdapter: LaneAdapter;
  routerConfig: RouterPolicyConfig;
};

function getLaneAdapter(runtime: UnifiedRuntime, lane: LaneId): LaneAdapter {
  return lane === "eve" ? runtime.eveAdapter : runtime.hermesAdapter;
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
  return { ...state, traceId };
}

function buildResult(
  envelope: UnifiedMessageEnvelope,
  routing: RoutingDecision,
  primaryState: DispatchState,
  responseState: DispatchState,
  fallbackState?: DispatchState,
): UnifiedDispatchResult {
  const response = validateUnifiedResponse(responseFromState(responseState, envelope.traceId));
  return {
    envelope,
    routing,
    primaryState,
    fallbackState,
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

  const routing = routeMessage(envelope, runtime.routerConfig);
  const primary = getLaneAdapter(runtime, routing.primaryLane);
  const primaryState = withCanonicalTraceId(
    await primary.dispatch({
      envelope,
      intentRoute: `unified:${routing.reason}`,
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
    }),
    envelope.traceId,
  );
  return buildResult(envelope, routing, primaryState, fallbackState, fallbackState);
}
