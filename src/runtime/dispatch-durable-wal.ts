import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

export type DispatchWalAttemptRecord = {
  walVersion: "v1";
  event: "dispatch_attempt";
  attemptId: string;
  recordedAtIso: string;
  channel: "telegram";
  chatId: string;
  messageId: string;
  text: string;
  tenantId?: string;
  regionId?: string;
};

export type DispatchWalCompleteRecord = {
  walVersion: "v1";
  event: "dispatch_complete";
  attemptId: string;
  recordedAtIso: string;
  traceId: string;
  primaryStatus: "pass" | "failed";
  responseFailureClass: string;
  laneUsed: string;
};

export type DispatchWalReplayCompleteRecord = {
  walVersion: "v1";
  event: "dispatch_replay_complete";
  attemptId: string;
  originalAttemptId: string;
  recordedAtIso: string;
  traceId: string;
  primaryStatus: "pass" | "failed";
  responseFailureClass: string;
  laneUsed: string;
};

export async function appendDispatchWalLine(walPath: string, record: unknown): Promise<void> {
  await mkdir(path.dirname(walPath), { recursive: true });
  await appendFile(walPath, `${JSON.stringify(record)}\n`, "utf8");
}

export type OrphanDispatchAttempt = {
  attemptId: string;
  channel: "telegram";
  chatId: string;
  messageId: string;
  text: string;
  recordedAtIso: string;
  tenantId?: string;
  regionId?: string;
};

/**
 * Returns attempts that have no matching dispatch_complete (same attemptId).
 * dispatch_replay_complete with originalAttemptId also closes an attempt.
 */
export async function findOrphanDispatchAttempts(walPath: string): Promise<OrphanDispatchAttempt[]> {
  let raw = "";
  try {
    raw = await readFile(walPath, "utf8");
  } catch {
    return [];
  }
  const completed = new Set<string>();
  const attempts = new Map<string, OrphanDispatchAttempt>();
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    let parsed: { event?: string; attemptId?: string; originalAttemptId?: string } & Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmed) as typeof parsed;
    } catch {
      continue;
    }
    if (parsed.event === "dispatch_complete" && typeof parsed.attemptId === "string") {
      completed.add(parsed.attemptId);
      continue;
    }
    if (parsed.event === "dispatch_replay_complete" && typeof parsed.originalAttemptId === "string") {
      completed.add(parsed.originalAttemptId);
      continue;
    }
    if (parsed.event === "dispatch_attempt" && typeof parsed.attemptId === "string") {
      const channel = parsed.channel === "telegram" ? "telegram" : "telegram";
      const chatId = String(parsed.chatId ?? "");
      const messageId = String(parsed.messageId ?? "");
      const text = String(parsed.text ?? "");
      const recordedAtIso = String(parsed.recordedAtIso ?? "");
      const tenantId =
        typeof parsed.tenantId === "string" && parsed.tenantId.trim().length > 0
          ? parsed.tenantId.trim()
          : undefined;
      const regionId =
        typeof parsed.regionId === "string" && parsed.regionId.trim().length > 0
          ? parsed.regionId.trim()
          : undefined;
      if (chatId && messageId && text) {
        attempts.set(parsed.attemptId, {
          attemptId: parsed.attemptId,
          channel,
          chatId,
          messageId,
          text,
          recordedAtIso,
          tenantId,
          regionId,
        });
      }
    }
  }
  const orphans: OrphanDispatchAttempt[] = [];
  for (const [id, attempt] of attempts) {
    if (!completed.has(id)) {
      orphans.push(attempt);
    }
  }
  return orphans.sort((a, b) => a.recordedAtIso.localeCompare(b.recordedAtIso));
}
