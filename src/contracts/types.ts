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
  /** Truncated subprocess stdout (Hermes lane; Eve on non-timeout failure paths). */
  laneStdout?: string;
  /** Truncated subprocess stderr. */
  laneStderr?: string;
};

export type UnifiedResponse = {
  consumed: boolean;
  responseText: string;
  failureClass: FailureClass;
  laneUsed: LaneId;
  traceId: string;
};
