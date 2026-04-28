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
  /** H5: optional tenant scope for isolation (memory keys, policy). */
  tenantId?: string;
  /** H5: optional region label for routing metadata / failover simulation. */
  regionId?: string;
  metadata?: Record<string, string>;
};

export type RoutingDecision = {
  primaryLane: LaneId;
  fallbackLane: LaneId | "none";
  reason: string;
  policyVersion: string;
  failClosed: boolean;
  /** H5: region from envelope when present. */
  dispatchRegionId?: string;
  /** H5: region pinned in router policy when present. */
  routerRegionId?: string;
  /** H5: true when both region ids are set and equal, or when neither is set. */
  regionAligned?: boolean;
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

export type UnifiedDispatchResult = {
  envelope: UnifiedMessageEnvelope;
  routing: RoutingDecision;
  primaryState: DispatchState;
  fallbackState?: DispatchState;
  fallbackInfo?: DispatchFallbackInfo;
  capabilityDecision?: UnifiedCapabilityDecision;
  capabilityExecution?: CapabilityExecutionResult;
  response: UnifiedResponse;
};
