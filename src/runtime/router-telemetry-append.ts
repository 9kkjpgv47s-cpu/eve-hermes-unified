import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type {
  DispatchState,
  FailureClass,
  LaneId,
  RoutingDecision,
  UnifiedMessageEnvelope,
} from "../contracts/types.js";
import { ROUTER_TELEMETRY_SCHEMA_VERSION } from "../contracts/router-telemetry-version.js";
import { normalizeValidatedTenantId, resolveEnvelopeTenantId } from "./tenant-scope.js";
import { maybeRotateJsonlLogInPlace } from "./jsonl-audit-rotation.js";

export type RouterTelemetryLogOptions = {
  maxBytesBeforeRotate?: number;
  retainBytesAfterRotate?: number;
};

export type RouterNoFallbackSkippedContext = {
  envelope: UnifiedMessageEnvelope;
  routing: RoutingDecision;
  primaryState: DispatchState;
  skippedFallbackLane: LaneId;
  noFallbackOnPrimaryFailureClasses: FailureClass[];
};

function buildNoFallbackSkippedRecord(ctx: RouterNoFallbackSkippedContext): Record<string, unknown> {
  const resolvedTenant = resolveEnvelopeTenantId(ctx.envelope);
  const tenantId = normalizeValidatedTenantId(resolvedTenant) ?? null;
  return {
    auditSchemaVersion: ROUTER_TELEMETRY_SCHEMA_VERSION,
    eventType: "router_no_fallback_skipped",
    recordedAtIso: new Date().toISOString(),
    traceId: ctx.envelope.traceId,
    chatId: ctx.envelope.chatId,
    messageId: ctx.envelope.messageId,
    tenantId,
    policyVersion: ctx.routing.policyVersion,
    routingReason: ctx.routing.reason,
    primaryLane: ctx.routing.primaryLane,
    skippedFallbackLane: ctx.skippedFallbackLane,
    primaryFailureClass: ctx.primaryState.failureClass,
    noFallbackOnPrimaryFailureClasses: [...ctx.noFallbackOnPrimaryFailureClasses],
    primaryRunId: ctx.primaryState.runId,
    primaryReason: ctx.primaryState.reason,
  };
}

async function appendJsonlLine(
  logPath: string,
  lineObject: Record<string, unknown>,
  options?: RouterTelemetryLogOptions,
): Promise<void> {
  const dir = path.dirname(logPath);
  await mkdir(dir, { recursive: true });
  const maxBytes = options?.maxBytesBeforeRotate ?? 0;
  const retainBytes = options?.retainBytesAfterRotate ?? 0;
  if (maxBytes > 0) {
    await maybeRotateJsonlLogInPlace(logPath, maxBytes, retainBytes > 0 ? retainBytes : Math.floor(maxBytes / 2));
  }
  await appendFile(logPath, `${JSON.stringify(lineObject)}\n`, "utf8");
}

export async function appendRouterTelemetryNoFallbackSkipped(
  logPath: string,
  ctx: RouterNoFallbackSkippedContext,
  options?: RouterTelemetryLogOptions,
): Promise<void> {
  await appendJsonlLine(logPath, buildNoFallbackSkippedRecord(ctx), options);
}
