import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
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

export type CapabilityPolicySnapshotAuditRecord = {
  recordedAtIso: string;
  kind: "capability_policy_config_snapshot";
  fingerprintSha256: string;
  stableJson: string;
};

export async function appendCapabilityPolicySnapshotIfChanged(
  logPath: string,
  stableJson: string,
): Promise<void> {
  const fingerprintSha256 = createHash("sha256").update(stableJson, "utf8").digest("hex");
  let lastFingerprint: string | undefined;
  try {
    const raw = await readFile(logPath, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      try {
        const parsed = JSON.parse(lines[i]!) as { kind?: string; fingerprintSha256?: string };
        if (parsed?.kind === "capability_policy_config_snapshot" && parsed.fingerprintSha256) {
          lastFingerprint = parsed.fingerprintSha256;
          break;
        }
      } catch {
        // skip
      }
    }
  } catch {
    // missing file is first run
  }
  if (lastFingerprint === fingerprintSha256) {
    return;
  }
  const dir = path.dirname(logPath);
  await mkdir(dir, { recursive: true });
  const record: CapabilityPolicySnapshotAuditRecord = {
    recordedAtIso: new Date().toISOString(),
    kind: "capability_policy_config_snapshot",
    fingerprintSha256,
    stableJson,
  };
  await appendFile(logPath, `${JSON.stringify(record)}\n`, "utf8");
}
