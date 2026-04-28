import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { UnifiedDispatchResult } from "../contracts/types.js";
import { UNIFIED_DISPATCH_AUDIT_SCHEMA_VERSION } from "../contracts/dispatch-audit-version.js";
import { normalizeValidatedTenantId, resolveEnvelopeTenantId } from "./tenant-scope.js";
import { maybeRotateJsonlLogInPlace } from "./jsonl-audit-rotation.js";

export type DispatchAuditLogOptions = {
  /** When > 0, if the log file exceeds this size (bytes), rotate before appending. */
  maxBytesBeforeRotate?: number;
  /** Bytes of the end of the current log to keep in the primary file after rotation (line-aligned). */
  retainBytesAfterRotate?: number;
};

function buildRecord(result: UnifiedDispatchResult): string {
  const resolvedTenant = resolveEnvelopeTenantId(result.envelope);
  const tenantId = normalizeValidatedTenantId(resolvedTenant) ?? null;
  return JSON.stringify({
    auditSchemaVersion: UNIFIED_DISPATCH_AUDIT_SCHEMA_VERSION,
    recordedAtIso: new Date().toISOString(),
    traceId: result.envelope.traceId,
    chatId: result.envelope.chatId,
    messageId: result.envelope.messageId,
    tenantId,
    routing: result.routing,
    primaryState: result.primaryState,
    fallbackState: result.fallbackState,
    fallbackInfo: result.fallbackInfo,
    capabilityDecision: result.capabilityDecision,
    capabilityExecution: result.capabilityExecution,
    response: result.response,
  });
}

export async function appendDispatchAuditLog(
  logPath: string,
  result: UnifiedDispatchResult,
  options?: DispatchAuditLogOptions,
): Promise<void> {
  const dir = path.dirname(logPath);
  await mkdir(dir, { recursive: true });

  const maxBytes = options?.maxBytesBeforeRotate ?? 0;
  const retainBytes = options?.retainBytesAfterRotate ?? 0;
  if (maxBytes > 0) {
    await maybeRotateJsonlLogInPlace(logPath, maxBytes, retainBytes > 0 ? retainBytes : Math.floor(maxBytes / 2));
  }

  const record = buildRecord(result);
  await appendFile(logPath, `${record}\n`, "utf8");
}
