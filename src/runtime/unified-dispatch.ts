import { randomUUID } from "node:crypto";
import type {
  DispatchState,
  LaneId,
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

function responseFromState(state: DispatchState, envelopeTraceId: string): UnifiedResponse {
  const traceId = state.traceId.trim().length > 0 ? state.traceId : envelopeTraceId;
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

export async function dispatchUnifiedMessage(
  runtime: UnifiedRuntime,
  input: Omit<UnifiedMessageEnvelope, "traceId" | "receivedAtIso">,
): Promise<{ envelope: UnifiedMessageEnvelope; decision: string; response: UnifiedResponse }> {
  const envelope = validateEnvelope({
    ...input,
    traceId: `unified-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`,
    receivedAtIso: new Date().toISOString(),
  });

  const decision = routeMessage(envelope, runtime.routerConfig);
  const primary = getLaneAdapter(runtime, decision.primaryLane);
  const primaryState = await primary.dispatch({
    envelope,
    intentRoute: `unified:${decision.reason}`,
  });
  if (primaryState.status === "pass" || decision.fallbackLane === "none" || decision.failClosed) {
    const response = validateUnifiedResponse(responseFromState(primaryState, envelope.traceId));
    return { envelope, decision: decision.reason, response };
  }

  const fallback = getLaneAdapter(runtime, decision.fallbackLane);
  const fallbackState = await fallback.dispatch({
    envelope,
    intentRoute: `unified:fallback_after_${decision.reason}`,
  });
  const response = validateUnifiedResponse(responseFromState(fallbackState, envelope.traceId));
  return { envelope, decision: `${decision.reason}:fallback`, response };
}
