import {
  type CapabilityExecutionResult,
  type DispatchState,
  type FailureClass,
  type RoutingDecision,
  type UnifiedCapabilityDecision,
  type UnifiedDispatchResult,
  type UnifiedMessageEnvelope,
  type UnifiedResponse,
} from "./types.js";

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isLane(value: string): value is "eve" | "hermes" {
  return value === "eve" || value === "hermes";
}

export function validateEnvelope(value: UnifiedMessageEnvelope): UnifiedMessageEnvelope {
  ensure(value.traceId.length > 0, "Envelope traceId is required.");
  ensure(value.channel === "telegram", "Envelope channel must be telegram.");
  ensure(value.chatId.length > 0, "Envelope chatId is required.");
  ensure(value.messageId.length > 0, "Envelope messageId is required.");
  ensure(value.text.length > 0, "Envelope text is required.");
  if (value.tenantId !== undefined) {
    ensure(typeof value.tenantId === "string" && value.tenantId.trim().length > 0, "tenantId must be non-empty when set.");
  }
  if (value.regionId !== undefined) {
    ensure(typeof value.regionId === "string" && value.regionId.trim().length > 0, "regionId must be non-empty when set.");
  }
  return value;
}

export function validateRoutingDecision(value: RoutingDecision): RoutingDecision {
  ensure(value.reason.length > 0, "Routing decision reason is required.");
  ensure(value.policyVersion.length > 0, "Routing decision policyVersion is required.");
  ensure(isLane(value.primaryLane), "Invalid primary lane.");
  ensure(
    isLane(value.fallbackLane) || value.fallbackLane === "none",
    "Invalid fallback lane.",
  );
  if (value.dispatchRegionId !== undefined) {
    ensure(
      typeof value.dispatchRegionId === "string" && value.dispatchRegionId.trim().length > 0,
      "dispatchRegionId must be non-empty when set.",
    );
  }
  if (value.routerRegionId !== undefined) {
    ensure(
      typeof value.routerRegionId === "string" && value.routerRegionId.trim().length > 0,
      "routerRegionId must be non-empty when set.",
    );
  }
  if (value.regionAligned === false) {
    ensure(
      Boolean(value.dispatchRegionId && value.routerRegionId),
      "regionAligned=false requires dispatchRegionId and routerRegionId.",
    );
  }
  return value;
}

export function validateDispatchState(value: DispatchState): DispatchState {
  ensure(value.runId.length > 0, "Dispatch runId is required.");
  ensure(value.reason.length > 0, "Dispatch reason is required.");
  ensure(value.runtimeUsed.length > 0, "Dispatch runtimeUsed is required.");
  ensure(value.elapsedMs >= 0, "Dispatch elapsedMs must be >= 0.");
  ensure(value.sourceChatId.length > 0, "Dispatch sourceChatId is required.");
  ensure(value.sourceMessageId.length > 0, "Dispatch sourceMessageId is required.");
  ensure(value.traceId.length > 0, "Dispatch traceId is required.");
  ensure(isLane(value.sourceLane), "Dispatch sourceLane is invalid.");
  ensure(
    isFailureClass(value.failureClass),
    "Dispatch failureClass must be one of none|provider_limit|cooldown|dispatch_failure|state_unavailable|policy_failure.",
  );
  if (value.status === "pass") {
    ensure(value.failureClass === "none", "Dispatch failureClass must be none when status=pass.");
  }
  return value;
}

export function validateUnifiedResponse(value: UnifiedResponse): UnifiedResponse {
  ensure(value.responseText.length > 0 || value.consumed === false, "Response text required when consumed.");
  ensure(value.traceId.length > 0, "Unified response traceId is required.");
  ensure(isLane(value.laneUsed), "Unified response laneUsed is invalid.");
  ensure(
    isFailureClass(value.failureClass),
    "Unified response failureClass must be one of none|provider_limit|cooldown|dispatch_failure|state_unavailable|policy_failure.",
  );
  return value;
}

export function validateCapabilityDecision(value: UnifiedCapabilityDecision): UnifiedCapabilityDecision {
  ensure(value.id.trim().length > 0, "Capability decision id is required.");
  ensure(isLane(value.lane), "Capability decision lane is invalid.");
  ensure(value.routeReason.trim().length > 0, "Capability decision routeReason is required.");
  return value;
}

export function validateCapabilityExecutionResult(
  value: CapabilityExecutionResult,
): CapabilityExecutionResult {
  ensure(value.capability.id.trim().length > 0, "Capability execution must include capability id.");
  ensure(
    isLane(value.capability.lane),
    "Capability execution lane is invalid.",
  );
  ensure(value.status === "pass" || value.status === "failed", "Capability execution status is invalid.");
  ensure(
    isFailureClass(value.failureClass),
    "Capability execution failureClass must be one of none|provider_limit|cooldown|dispatch_failure|state_unavailable|policy_failure.",
  );
  if (value.status === "pass") {
    ensure(value.failureClass === "none", "Capability execution failureClass must be none when status=pass.");
  }
  ensure(value.outputText.trim().length > 0, "Capability execution outputText is required.");
  ensure(value.reason.trim().length > 0, "Capability execution reason is required.");
  ensure(value.runId.trim().length > 0, "Capability execution runId is required.");
  ensure(value.elapsedMs >= 0, "Capability execution elapsedMs must be >= 0.");
  return value;
}

export function validateUnifiedDispatchResult(value: UnifiedDispatchResult): UnifiedDispatchResult {
  validateEnvelope(value.envelope);
  validateRoutingDecision(value.routing);
  validateDispatchState(value.primaryState);
  if (value.fallbackState) {
    validateDispatchState(value.fallbackState);
  }
  if (value.primaryFallbackLimited === true) {
    ensure(!value.fallbackState, "primaryFallbackLimited must not include fallbackState.");
    ensure(!value.fallbackInfo, "primaryFallbackLimited must not include fallbackInfo.");
  }
  validateUnifiedResponse(value.response);
  if (value.capabilityDecision) {
    validateCapabilityDecision(value.capabilityDecision);
  }
  if (value.capabilityExecution) {
    validateCapabilityExecutionResult(value.capabilityExecution);
  }
  if (value.contractVersion !== undefined) {
    ensure(typeof value.contractVersion === "string" && value.contractVersion.trim().length > 0, "contractVersion must be non-empty when set.");
  }
  if (value.contractSchemaRef !== undefined) {
    ensure(typeof value.contractSchemaRef === "string" && value.contractSchemaRef.trim().length > 0, "contractSchemaRef must be non-empty when set.");
  }
  return value;
}

function isFailureClass(value: FailureClass): boolean {
  return (
    value === "none" ||
    value === "provider_limit" ||
    value === "cooldown" ||
    value === "dispatch_failure" ||
    value === "state_unavailable" ||
    value === "policy_failure"
  );
}
