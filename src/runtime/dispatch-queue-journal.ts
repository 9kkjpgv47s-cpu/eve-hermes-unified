import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { RoutingDecision, UnifiedDispatchResult, UnifiedMessageEnvelope } from "../contracts/types.js";
import { DISPATCH_QUEUE_JOURNAL_SCHEMA_VERSION } from "../contracts/dispatch-queue-version.js";
import { normalizeValidatedTenantId, resolveEnvelopeTenantId } from "./tenant-scope.js";
import { maybeRotateJsonlLogInPlace } from "./jsonl-audit-rotation.js";

export type DispatchQueueJournalOptions = {
  maxBytesBeforeRotate?: number;
  retainBytesAfterRotate?: number;
};

function tenantForQueue(envelope: UnifiedMessageEnvelope): string | null {
  const resolved = resolveEnvelopeTenantId(envelope);
  return normalizeValidatedTenantId(resolved) ?? null;
}

export async function appendDispatchQueueAccepted(
  logPath: string,
  payload: {
    envelope: UnifiedMessageEnvelope;
    routing: RoutingDecision;
    path: "lane" | "capability";
  },
  options?: DispatchQueueJournalOptions,
): Promise<void> {
  const dir = path.dirname(logPath);
  await mkdir(dir, { recursive: true });
  const maxBytes = options?.maxBytesBeforeRotate ?? 0;
  const retainBytes = options?.retainBytesAfterRotate ?? 0;
  if (maxBytes > 0) {
    await maybeRotateJsonlLogInPlace(logPath, maxBytes, retainBytes > 0 ? retainBytes : Math.floor(maxBytes / 2));
  }
  const line = JSON.stringify({
    auditSchemaVersion: DISPATCH_QUEUE_JOURNAL_SCHEMA_VERSION,
    eventType: "dispatch_queue_accepted",
    recordedAtIso: new Date().toISOString(),
    traceId: payload.envelope.traceId,
    chatId: payload.envelope.chatId,
    messageId: payload.envelope.messageId,
    tenantId: tenantForQueue(payload.envelope),
    dispatchPath: payload.path,
    routing: payload.routing,
  });
  await appendFile(logPath, `${line}\n`, "utf8");
}

export async function appendDispatchQueueFinished(
  logPath: string,
  result: UnifiedDispatchResult,
  options?: DispatchQueueJournalOptions,
): Promise<void> {
  const dir = path.dirname(logPath);
  await mkdir(dir, { recursive: true });
  const maxBytes = options?.maxBytesBeforeRotate ?? 0;
  const retainBytes = options?.retainBytesAfterRotate ?? 0;
  if (maxBytes > 0) {
    await maybeRotateJsonlLogInPlace(logPath, maxBytes, retainBytes > 0 ? retainBytes : Math.floor(maxBytes / 2));
  }
  const fi = result.fallbackInfo;
  const line = JSON.stringify({
    auditSchemaVersion: DISPATCH_QUEUE_JOURNAL_SCHEMA_VERSION,
    eventType: "dispatch_queue_finished",
    recordedAtIso: new Date().toISOString(),
    traceId: result.envelope.traceId,
    chatId: result.envelope.chatId,
    messageId: result.envelope.messageId,
    tenantId: tenantForQueue(result.envelope),
    responseLaneUsed: result.response.laneUsed,
    responseFailureClass: result.response.failureClass,
    primaryLane: result.routing.primaryLane,
    primaryStatus: result.primaryState.status,
    fallbackAttempted: fi?.attempted ?? false,
    fallbackReason: fi?.reason,
    capabilityConsumed: result.capabilityExecution?.consumed ?? false,
  });
  await appendFile(logPath, `${line}\n`, "utf8");
}
