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
import type { UnifiedMemoryStore } from "../memory/unified-memory-store.js";
import type { CapabilityRegistry } from "../capabilities/capability-registry.js";

export type UnifiedRuntime = {
  eveAdapter: LaneAdapter;
  hermesAdapter: LaneAdapter;
  routerConfig: RouterPolicyConfig;
  memoryStore?: UnifiedMemoryStore;
  capabilityRegistry?: CapabilityRegistry;
  /** Optional hooks for soak / telemetry (primary and fallback lane states). */
  dispatchHooks?: {
    afterPrimary?(state: DispatchState): void;
    afterFallback?(state: DispatchState): void;
  };
};

async function persistLaneMemoryIfPassed(
  memoryStore: UnifiedMemoryStore | undefined,
  chatId: string,
  lane: LaneId,
  state: DispatchState,
): Promise<void> {
  if (!memoryStore || state.status !== "pass" || !memoryStore.mergeWorkingSet) {
    return;
  }
  await memoryStore.mergeWorkingSet(chatId, {
    last_lane: lane,
    last_run_id: state.runId,
    last_reason: state.reason,
  });
}

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
  const memoryStore = runtime.memoryStore;
  const memoryScope = {
    chatId: envelope.chatId,
    traceId: envelope.traceId,
    messageId: envelope.messageId,
  };
  const memorySnapshot = memoryStore ? await memoryStore.readWorkingSet(memoryScope) : undefined;
  const capReg = runtime.capabilityRegistry;

  const primaryExtras = {
    ...(memorySnapshot !== undefined ? { memorySnapshot } : {}),
    ...(capReg ? { capabilityIds: capReg.forLane(decision.primaryLane).map((c) => c.id) as readonly string[] } : {}),
  };

  const primary = getLaneAdapter(runtime, decision.primaryLane);
  const primaryState = await primary.dispatch({
    envelope,
    intentRoute: `unified:${decision.reason}`,
    ...primaryExtras,
  });

  if (memoryStore) {
    await memoryStore.appendDispatchEvent({
      ...memoryScope,
      lane: decision.primaryLane,
      phase: "primary",
      status: primaryState.status,
      reason: primaryState.reason,
    });
  }

  runtime.dispatchHooks?.afterPrimary?.(primaryState);

  await persistLaneMemoryIfPassed(memoryStore, envelope.chatId, decision.primaryLane, primaryState);

  if (primaryState.status === "pass" || decision.fallbackLane === "none" || decision.failClosed) {
    const response = validateUnifiedResponse(responseFromState(primaryState, envelope.traceId));
    return { envelope, decision: decision.reason, response };
  }

  const fallback = getLaneAdapter(runtime, decision.fallbackLane);
  const fallbackExtras = {
    ...(memorySnapshot !== undefined ? { memorySnapshot } : {}),
    ...(capReg
      ? { capabilityIds: capReg.forLane(decision.fallbackLane).map((c) => c.id) as readonly string[] }
      : {}),
  };
  const fallbackState = await fallback.dispatch({
    envelope,
    intentRoute: `unified:fallback_after_${decision.reason}`,
    ...fallbackExtras,
  });

  if (memoryStore) {
    await memoryStore.appendDispatchEvent({
      ...memoryScope,
      lane: decision.fallbackLane,
      phase: "fallback",
      status: fallbackState.status,
      reason: fallbackState.reason,
    });
  }

  runtime.dispatchHooks?.afterFallback?.(fallbackState);

  await persistLaneMemoryIfPassed(memoryStore, envelope.chatId, decision.fallbackLane, fallbackState);

  const response = validateUnifiedResponse(responseFromState(fallbackState, envelope.traceId));
  return { envelope, decision: `${decision.reason}:fallback`, response };
}
