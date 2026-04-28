import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { UnifiedDispatchResult } from "../contracts/types.js";
import { rotateLogFileIfNeeded } from "./audit-log-rotate.js";

export type DispatchAuditLogOptions = {
  /** When > 0, rotate active log before append if file size ≥ this many bytes. */
  maxBytesBeforeRotate?: number;
  /** Keep at most this many rotated files (`logPath.1` … `logPath.N`); default 8. */
  maxRotatedFiles?: number;
};

export async function appendDispatchAuditLog(
  logPath: string,
  result: UnifiedDispatchResult,
  options?: DispatchAuditLogOptions,
): Promise<void> {
  const dir = path.dirname(logPath);
  await mkdir(dir, { recursive: true });
  const maxBytes = options?.maxBytesBeforeRotate ?? 0;
  const maxFiles = options?.maxRotatedFiles ?? 8;
  await rotateLogFileIfNeeded(logPath, maxBytes, maxFiles);

  const record = JSON.stringify({
    recordedAtIso: new Date().toISOString(),
    traceId: result.envelope.traceId,
    chatId: result.envelope.chatId,
    messageId: result.envelope.messageId,
    routing: result.routing,
    primaryState: result.primaryState,
    fallbackState: result.fallbackState,
    fallbackInfo: result.fallbackInfo,
    capabilityDecision: result.capabilityDecision,
    capabilityExecution: result.capabilityExecution,
    response: result.response,
  });
  await appendFile(logPath, `${record}\n`, "utf8");
}
