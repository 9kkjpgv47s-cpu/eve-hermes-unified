export type LaneId = "eve" | "hermes";

export type IngressChannel = "telegram";

export type FailureClass =
  | "none"
  | "provider_limit"
  | "cooldown"
  | "dispatch_failure"
  | "state_unavailable"
  | "policy_failure";

export type UnifiedMessageEnvelope = {
  traceId: string;
  channel: IngressChannel;
  chatId: string;
  messageId: string;
  receivedAtIso: string;
  text: string;
  metadata?: Record<string, string>;
};

export type RoutingDecision = {
  primaryLane: LaneId;
  fallbackLane: LaneId | "none";
  reason: string;
  policyVersion: string;
  failClosed: boolean;
};

export type DispatchState = {
  status: "pass" | "failed";
  reason: string;
  runtimeUsed: string;
  runId: string;
  elapsedMs: number;
  failureClass: FailureClass;
  sourceLane: LaneId;
  sourceChatId: string;
  sourceMessageId: string;
  traceId: string;
};

export type UnifiedResponse = {
  consumed: boolean;
  responseText: string;
  failureClass: FailureClass;
  laneUsed: LaneId;
  traceId: string;
};

export type UnifiedCapabilityDecision = {
  id: string;
  lane: LaneId;
  routeReason: string;
};

export type CapabilityExecutionResult = {
  capability: UnifiedCapabilityDecision;
  status: "pass" | "failed";
  consumed: boolean;
  reason: string;
  outputText: string;
  failureClass: FailureClass;
  runId: string;
  elapsedMs: number;
  metadata?: Record<string, string>;
};

export type DispatchFallbackInfo = {
  attempted: boolean;
  reason: string;
  fromLane: LaneId;
  toLane: LaneId;
};

/** Frozen dispatch envelope + outcome shape for external consumers; bump when breaking. */
export const UNIFIED_DISPATCH_CONTRACT_VERSION = "v1" as const;
export type UnifiedDispatchContractVersion = typeof UNIFIED_DISPATCH_CONTRACT_VERSION;

export type UnifiedDispatchResult = {
  contractVersion: UnifiedDispatchContractVersion;
  envelope: UnifiedMessageEnvelope;
  routing: RoutingDecision;
  primaryState: DispatchState;
  fallbackState?: DispatchState;
  fallbackInfo?: DispatchFallbackInfo;
  capabilityDecision?: UnifiedCapabilityDecision;
  capabilityExecution?: CapabilityExecutionResult;
  response: UnifiedResponse;
};
