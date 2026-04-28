import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import type { UnifiedDispatchResult } from "../contracts/types.js";

export type AppendDispatchAuditLogOptions = {
  /** When true and envelope has tenantId, append to per-tenant file under the same directory as the base path. */
  tenantPartition?: boolean;
  /** When > 0, rotate the active log file before append if its size exceeds this many bytes. */
  maxBytesBeforeRotate?: number;
};

function sanitizeTenantSegment(tenantId: string): string {
  const s = tenantId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const trimmed = s.slice(0, 64);
  return trimmed.length > 0 ? trimmed : "unknown";
}

function resolveAuditLogPath(baseLogPath: string, result: UnifiedDispatchResult, tenantPartition: boolean): string {
  const tenant = result.envelope.tenantId?.trim();
  if (!tenantPartition || !tenant) {
    return baseLogPath;
  }
  const dir = path.dirname(baseLogPath);
  const base = path.basename(baseLogPath, path.extname(baseLogPath));
  const ext = path.extname(baseLogPath) || ".jsonl";
  const segment = sanitizeTenantSegment(tenant);
  return path.join(dir, `${base}.tenant-${segment}${ext}`);
}

async function maybeRotateLogFile(activePath: string, maxBytes: number): Promise<void> {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    return;
  }
  try {
    const st = await stat(activePath);
    if (st.size < maxBytes) {
      return;
    }
  } catch {
    return;
  }
  const dir = path.dirname(activePath);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rotated = path.join(dir, `${path.basename(activePath)}.rotated-${stamp}`);
  await rename(activePath, rotated);
}

export async function appendDispatchAuditLog(
  logPath: string,
  result: UnifiedDispatchResult,
  options?: AppendDispatchAuditLogOptions,
): Promise<void> {
  const activePath = resolveAuditLogPath(logPath, result, Boolean(options?.tenantPartition));
  const maxBytes = options?.maxBytesBeforeRotate ?? 0;
  await maybeRotateLogFile(activePath, maxBytes);

  const dir = path.dirname(activePath);
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
  await appendFile(activePath, `${record}\n`, "utf8");
}
