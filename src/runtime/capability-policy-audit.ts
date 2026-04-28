import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { CapabilityPolicyConfig } from "./capability-policy.js";

export type CapabilityPolicySnapshot = {
  defaultMode: "allow" | "deny";
  allowCapabilities: string[];
  denyCapabilities: string[];
  allowedChatIds: string[];
  deniedChatIds: string[];
  allowCapabilityChats: Record<string, string[]>;
  denyCapabilityChats: Record<string, string[]>;
};

function normalizeCapabilityId(value: string): string {
  return value.trim().toLowerCase();
}

function sortedStrings(values: string[]): string[] {
  return [...values].map((v) => v.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function sortedCapabilityChatMap(map: Record<string, string[]>): Record<string, string[]> {
  const normalized: Record<string, string[]> = {};
  for (const [rawKey, chats] of Object.entries(map)) {
    const key = normalizeCapabilityId(rawKey);
    if (!key) {
      continue;
    }
    normalized[key] = sortedStrings(chats ?? []);
  }
  const keys = Object.keys(normalized).sort((a, b) => a.localeCompare(b));
  const out: Record<string, string[]> = {};
  for (const key of keys) {
    out[key] = normalized[key];
  }
  return out;
}

/**
 * Normalized snapshot of the effective policy (sorted lists) for hashing and audit payloads.
 */
export function snapshotCapabilityPolicy(config: CapabilityPolicyConfig): CapabilityPolicySnapshot {
  return {
    defaultMode: config.defaultMode,
    allowCapabilities: sortedStrings(config.allowCapabilities.map((c) => normalizeCapabilityId(c))),
    denyCapabilities: sortedStrings(config.denyCapabilities.map((c) => normalizeCapabilityId(c))),
    allowedChatIds: sortedStrings(config.allowedChatIds),
    deniedChatIds: sortedStrings(config.deniedChatIds),
    allowCapabilityChats: sortedCapabilityChatMap(config.allowCapabilityChats),
    denyCapabilityChats: sortedCapabilityChatMap(config.denyCapabilityChats),
  };
}

export function capabilityPolicyFingerprint(config: CapabilityPolicyConfig): string {
  const snapshot = snapshotCapabilityPolicy(config);
  const h = createHash("sha256");
  h.update(JSON.stringify(snapshot));
  return h.digest("hex");
}

export async function appendCapabilityPolicyAuditLine(
  logPath: string,
  record: Record<string, unknown>,
): Promise<void> {
  const dir = path.dirname(logPath);
  await mkdir(dir, { recursive: true });
  await appendFile(logPath, `${JSON.stringify(record)}\n`, "utf8");
}

export async function appendCapabilityPolicyBootstrap(
  logPath: string,
  config: CapabilityPolicyConfig,
): Promise<void> {
  const snapshot = snapshotCapabilityPolicy(config);
  await appendCapabilityPolicyAuditLine(logPath, {
    kind: "capability_policy_bootstrap",
    recordedAtIso: new Date().toISOString(),
    policyFingerprint: capabilityPolicyFingerprint(config),
    policy: snapshot,
  });
}

export async function appendCapabilityPolicyDenial(input: {
  logPath: string;
  policyFingerprint: string;
  traceId: string;
  chatId: string;
  messageId: string;
  capabilityId: string;
  lane: "eve" | "hermes";
  reason: string;
}): Promise<void> {
  await appendCapabilityPolicyAuditLine(input.logPath, {
    kind: "capability_policy_denial",
    recordedAtIso: new Date().toISOString(),
    policyFingerprint: input.policyFingerprint,
    traceId: input.traceId,
    chatId: input.chatId,
    messageId: input.messageId,
    capabilityId: input.capabilityId,
    lane: input.lane,
    reason: input.reason,
  });
}
