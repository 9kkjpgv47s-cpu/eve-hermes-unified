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
  /** H5: optional tenant scope for memory isolation and capability policy. */
  tenantId?: string;
  /** H5: optional region hint for routing alignment checks. */
  regionId?: string;
};

export type RoutingDecision = {
  primaryLane: LaneId;
  fallbackLane: LaneId | "none";
  reason: string;
  policyVersion: string;
  failClosed: boolean;
  /** H5: region from envelope when present. */
  dispatchRegionId?: string;
  /** H5: configured router home region when set. */
  routerRegionId?: string;
  /** H5: false when both region ids are set and differ (primary/fallback may be swapped). */
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
  /** When true, automatic cross-lane fallback was skipped by policy (failure class not allowlisted). */
  primaryFallbackLimited?: boolean;
  capabilityDecision?: UnifiedCapabilityDecision;
  capabilityExecution?: CapabilityExecutionResult;
  response: UnifiedResponse;
  /** H4: pinned contract version for downstream consumers. */
  contractVersion?: string;
  /** H4: human-readable schema reference (path or URL). */
  contractSchemaRef?: string;
};
