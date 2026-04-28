import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { UnifiedDispatchResult } from "../contracts/types.js";

export type DispatchAuditRecord = UnifiedDispatchResult & {
  durability?: unknown;
};

export async function appendDispatchAuditLog(logPath: string, result: DispatchAuditRecord): Promise<void> {
  const dir = path.dirname(logPath);
  await mkdir(dir, { recursive: true });
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
    ...(result.durability !== undefined ? { durability: result.durability } : {}),
  });
  await appendFile(logPath, `${record}\n`, "utf8");
}
