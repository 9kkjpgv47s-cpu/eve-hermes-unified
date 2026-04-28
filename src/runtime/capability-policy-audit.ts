import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export type CapabilityPolicyDenialAuditRecord = {
  recordedAtIso: string;
  kind: "capability_policy_denial";
  capabilityId: string;
  lane: "eve" | "hermes";
  chatId: string;
  reason: string;
};

export async function appendCapabilityPolicyDenialAudit(
  logPath: string,
  payload: Omit<CapabilityPolicyDenialAuditRecord, "recordedAtIso" | "kind">,
): Promise<void> {
  const dir = path.dirname(logPath);
  await mkdir(dir, { recursive: true });
  const record: CapabilityPolicyDenialAuditRecord = {
    recordedAtIso: new Date().toISOString(),
    kind: "capability_policy_denial",
    ...payload,
  };
  await appendFile(logPath, `${JSON.stringify(record)}\n`, "utf8");
}
