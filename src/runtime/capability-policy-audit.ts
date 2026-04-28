import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { CAPABILITY_POLICY_AUDIT_SCHEMA_VERSION } from "../contracts/capability-policy-audit-version.js";
import type { LaneId } from "../contracts/types.js";
import { normalizeValidatedTenantId, resolveEnvelopeTenantId } from "./tenant-scope.js";
import type { UnifiedMessageEnvelope } from "../contracts/types.js";

export type CapabilityPolicyDenialAuditPayload = {
  traceId: string;
  chatId: string;
  messageId: string;
  capabilityId: string;
  lane: LaneId;
  policyReason: string;
  policyFingerprintSha256: string;
  envelope: UnifiedMessageEnvelope;
};

export type CapabilityPolicyConfigLoadedAuditPayload = {
  policyFingerprintSha256: string;
};

function tenantForAudit(envelope: UnifiedMessageEnvelope): string | null {
  const raw = resolveEnvelopeTenantId(envelope);
  const n = normalizeValidatedTenantId(raw);
  return n ?? null;
}

export async function appendCapabilityPolicyDenialAudit(
  logPath: string,
  payload: CapabilityPolicyDenialAuditPayload,
): Promise<void> {
  const dir = path.dirname(logPath);
  await mkdir(dir, { recursive: true });
  const line = JSON.stringify({
    auditSchemaVersion: CAPABILITY_POLICY_AUDIT_SCHEMA_VERSION,
    eventType: "policy_denial",
    recordedAtIso: new Date().toISOString(),
    traceId: payload.traceId,
    chatId: payload.chatId,
    messageId: payload.messageId,
    capabilityId: payload.capabilityId,
    lane: payload.lane,
    policyReason: payload.policyReason,
    policyFingerprintSha256: payload.policyFingerprintSha256,
    tenantId: tenantForAudit(payload.envelope),
  });
  await appendFile(logPath, `${line}\n`, "utf8");
}

export async function appendCapabilityPolicyConfigLoadedAudit(
  logPath: string,
  payload: CapabilityPolicyConfigLoadedAuditPayload,
): Promise<void> {
  const dir = path.dirname(logPath);
  await mkdir(dir, { recursive: true });
  const line = JSON.stringify({
    auditSchemaVersion: CAPABILITY_POLICY_AUDIT_SCHEMA_VERSION,
    eventType: "policy_config_loaded",
    recordedAtIso: new Date().toISOString(),
    policyFingerprintSha256: payload.policyFingerprintSha256,
  });
  await appendFile(logPath, `${line}\n`, "utf8");
}

/**
 * If the last non-empty line records the same policy fingerprint as `currentFingerprintSha256`,
 * skip appending (idempotent across restarts). Otherwise append `policy_config_loaded`.
 */
export async function maybeAppendCapabilityPolicyConfigLoadedAudit(
  logPath: string,
  currentFingerprintSha256: string,
): Promise<void> {
  try {
    const raw = await readFile(logPath, "utf8");
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length > 0) {
      const last = JSON.parse(lines[lines.length - 1]!) as {
        eventType?: string;
        policyFingerprintSha256?: string;
      };
      if (
        last?.eventType === "policy_config_loaded"
        && last.policyFingerprintSha256 === currentFingerprintSha256
      ) {
        return;
      }
    }
  } catch {
    // missing or unreadable — append
  }
  await appendCapabilityPolicyConfigLoadedAudit(logPath, {
    policyFingerprintSha256: currentFingerprintSha256,
  });
}
