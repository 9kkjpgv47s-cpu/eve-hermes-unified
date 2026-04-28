import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { maybeRotateAppendOnlyJsonlAuditLog } from "./audit-log-rotation.js";

export type CapabilityPolicyAuditRecord = {
  recordedAtIso: string;
  traceId: string;
  capabilityId: string;
  lane: "eve" | "hermes";
  chatId: string;
  messageId: string;
  tenantId?: string;
  regionId?: string;
  allowed: boolean;
  /** Stable machine reason from capability policy (e.g. tenant_not_allowlisted). */
  policyReason: string;
};

export async function appendCapabilityPolicyAuditLog(
  logPath: string,
  record: CapabilityPolicyAuditRecord,
  options?: {
    /** When maxBytes > 0, rotate active log before append (same semantics as dispatch audit JSONL). */
    rotation?: { maxBytes: number; retainCount: number };
  },
): Promise<void> {
  const dir = path.dirname(logPath);
  await mkdir(dir, { recursive: true });
  const rotation = options?.rotation;
  if (rotation && rotation.maxBytes > 0) {
    await maybeRotateAppendOnlyJsonlAuditLog(logPath, {
      maxBytes: rotation.maxBytes,
      retainCount: rotation.retainCount,
    });
  }
  await appendFile(logPath, `${JSON.stringify(record)}\n`, "utf8");
}
