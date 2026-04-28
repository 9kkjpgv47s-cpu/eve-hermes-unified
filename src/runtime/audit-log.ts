import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { UnifiedDispatchResult } from "../contracts/types.js";

export async function appendDispatchAuditLog(
  logPath: string,
  result: UnifiedDispatchResult,
): Promise<void> {
  const dir = path.dirname(logPath);
  await mkdir(dir, { recursive: true });
  const record = JSON.stringify({
    recordedAtIso: new Date().toISOString(),
    traceId: result.envelope.traceId,
    tenantId: result.envelope.tenantId,
    regionId: result.envelope.regionId,
    chatId: result.envelope.chatId,
    messageId: result.envelope.messageId,
    contractVersion: result.contractVersion,
    contractSchemaRef: result.contractSchemaRef,
    routing: result.routing,
    primaryState: result.primaryState,
    fallbackState: result.fallbackState,
    fallbackInfo: result.fallbackInfo,
    primaryFallbackLimited: result.primaryFallbackLimited,
    capabilityDecision: result.capabilityDecision,
    capabilityExecution: result.capabilityExecution,
    response: result.response,
  });
  await appendFile(logPath, `${record}\n`, "utf8");
}
