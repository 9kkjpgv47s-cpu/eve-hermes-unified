import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

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
): Promise<void> {
  const dir = path.dirname(logPath);
  await mkdir(dir, { recursive: true });
  await appendFile(logPath, `${JSON.stringify(record)}\n`, "utf8");
}
