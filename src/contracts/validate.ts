import {
  type DispatchState,
  type RoutingDecision,
  type UnifiedMessageEnvelope,
  type UnifiedResponse,
} from "./types.js";

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function validateEnvelope(value: UnifiedMessageEnvelope): UnifiedMessageEnvelope {
  ensure(value.traceId.length > 0, "Envelope traceId is required.");
  ensure(value.channel === "telegram", "Envelope channel must be telegram.");
  ensure(value.chatId.length > 0, "Envelope chatId is required.");
  ensure(value.messageId.length > 0, "Envelope messageId is required.");
  ensure(value.text.length > 0, "Envelope text is required.");
  return value;
}

export function validateRoutingDecision(value: RoutingDecision): RoutingDecision {
  ensure(value.reason.length > 0, "Routing decision reason is required.");
  ensure(value.policyVersion.length > 0, "Routing decision policyVersion is required.");
  ensure(value.primaryLane === "eve" || value.primaryLane === "hermes", "Invalid primary lane.");
  ensure(
    value.fallbackLane === "eve" || value.fallbackLane === "hermes" || value.fallbackLane === "none",
    "Invalid fallback lane.",
  );
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
  return value;
}

export function validateUnifiedResponse(value: UnifiedResponse): UnifiedResponse {
  ensure(value.responseText.length > 0 || value.consumed === false, "Response text required when consumed.");
  ensure(value.traceId.length > 0, "Unified response traceId is required.");
  return value;
}
