import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { UnifiedDispatchResult, UnifiedMessageEnvelope } from "../contracts/types.js";
import { validateEnvelope } from "../contracts/validate.js";
import type { UnifiedRuntime } from "./unified-dispatch.js";
import { dispatchUnifiedEnvelope } from "./unified-dispatch.js";

export type DispatchQueueEntryStatus = "pending" | "dispatched" | "failed";

export type DispatchQueueEntry = {
  id: string;
  enqueuedAtIso: string;
  attempts: number;
  status: DispatchQueueEntryStatus;
  envelope: UnifiedMessageEnvelope;
  lastError?: string;
  lastAttemptAtIso?: string;
};

type QueueFileV1 = {
  version: 1;
  entries: DispatchQueueEntry[];
};

function emptyQueue(): QueueFileV1 {
  return { version: 1, entries: [] };
}

async function loadQueue(filePath: string): Promise<QueueFileV1> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as QueueFileV1;
    if (parsed?.version !== 1 || !Array.isArray(parsed.entries)) {
      return emptyQueue();
    }
    return {
      version: 1,
      entries: parsed.entries.map((entry) => ({
        ...entry,
        envelope: validateEnvelope(entry.envelope),
      })),
    };
  } catch {
    return emptyQueue();
  }
}

async function saveQueueAtomic(filePath: string, data: QueueFileV1): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const serialized = `${JSON.stringify(data)}\n`;
  const tmpPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, serialized, "utf8");
  await rename(tmpPath, filePath);
}

/** Oldest dispatched/failed entries beyond maxNonTerminal are dropped; pending entries never removed. */
export function pruneCompletedDispatchQueueEntries(
  queue: QueueFileV1,
  maxNonTerminal: number,
): { pruned: number } {
  if (maxNonTerminal <= 0) {
    return { pruned: 0 };
  }
  const pending = queue.entries.filter((e) => e.status === "pending");
  const terminal = queue.entries.filter((e) => e.status !== "pending");
  if (terminal.length <= maxNonTerminal) {
    return { pruned: 0 };
  }
  const overflow = terminal.length - maxNonTerminal;
  const sorted = [...terminal].sort((a, b) => {
    const ta = Date.parse(a.enqueuedAtIso);
    const tb = Date.parse(b.enqueuedAtIso);
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) {
      return ta - tb;
    }
    return String(a.id).localeCompare(String(b.id));
  });
  const dropIds = new Set(sorted.slice(0, overflow).map((e) => e.id));
  const before = queue.entries.length;
  queue.entries = queue.entries.filter((e) => !dropIds.has(e.id));
  return { pruned: before - queue.entries.length };
}

async function mutateQueue(
  filePath: string,
  mutator: (queue: QueueFileV1) => void | Promise<void>,
  options?: { retentionNonTerminalMax?: number },
): Promise<void> {
  const queue = await loadQueue(filePath);
  await mutator(queue);
  const max = options?.retentionNonTerminalMax;
  if (typeof max === "number") {
    pruneCompletedDispatchQueueEntries(queue, max);
  }
  await saveQueueAtomic(filePath, queue);
}

/**
 * Append-only durable queue for unified dispatch envelopes (JSON file, atomic replace).
 */
export class FileDispatchDurabilityQueue {
  constructor(
    private readonly filePath: string,
    private readonly retentionNonTerminalMax = 0,
  ) {}

  async appendEnvelope(envelope: UnifiedMessageEnvelope): Promise<string> {
    const validated = validateEnvelope(envelope);
    const id = `dq-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const entry: DispatchQueueEntry = {
      id,
      enqueuedAtIso: new Date().toISOString(),
      attempts: 0,
      status: "pending",
      envelope: validated,
    };
    await mutateQueue(
      this.filePath,
      (queue) => {
        queue.entries.push(entry);
      },
      { retentionNonTerminalMax: this.retentionNonTerminalMax },
    );
    return id;
  }

  async listPending(): Promise<DispatchQueueEntry[]> {
    const queue = await loadQueue(this.filePath);
    return queue.entries.filter((e) => e.status === "pending");
  }

  async incrementAttempt(id: string): Promise<void> {
    const now = new Date().toISOString();
    await mutateQueue(
      this.filePath,
      (queue) => {
        const entry = queue.entries.find((e) => e.id === id);
        if (!entry || entry.status !== "pending") {
          return;
        }
        entry.attempts += 1;
        entry.lastAttemptAtIso = now;
      },
      { retentionNonTerminalMax: this.retentionNonTerminalMax },
    );
  }

  async markDispatched(id: string): Promise<void> {
    await mutateQueue(
      this.filePath,
      (queue) => {
        const entry = queue.entries.find((e) => e.id === id);
        if (!entry) {
          return;
        }
        entry.status = "dispatched";
        entry.lastError = undefined;
      },
      { retentionNonTerminalMax: this.retentionNonTerminalMax },
    );
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    await mutateQueue(
      this.filePath,
      (queue) => {
        const entry = queue.entries.find((e) => e.id === id);
        if (!entry) {
          return;
        }
        entry.status = "failed";
        entry.lastError = errorMessage.slice(0, 2048);
      },
      { retentionNonTerminalMax: this.retentionNonTerminalMax },
    );
  }
}

export type ReplayPendingResult = {
  entryId: string;
  result: UnifiedDispatchResult;
};

/**
 * Replays pending entries through unified dispatch (preserves envelope traceId for correlation).
 */
export async function replayPendingDispatches(
  runtime: UnifiedRuntime,
  queue: FileDispatchDurabilityQueue,
  options?: { limit?: number },
): Promise<ReplayPendingResult[]> {
  const pending = await queue.listPending();
  const slice =
    typeof options?.limit === "number" && options.limit >= 0
      ? pending.slice(0, options.limit)
      : pending;
  const results: ReplayPendingResult[] = [];

  for (const entry of slice) {
    await queue.incrementAttempt(entry.id);
    try {
      const result = await dispatchUnifiedEnvelope(runtime, entry.envelope);
      const primaryOk =
        result.primaryState.status === "pass" ||
        result.capabilityExecution?.status === "pass";
      if (!primaryOk) {
        await queue.markFailed(entry.id, "replay_primary_still_failed");
        continue;
      }
      await queue.markDispatched(entry.id);
      results.push({ entryId: entry.id, result });
    } catch (error) {
      await queue.markFailed(entry.id, String(error));
    }
  }

  return results;
}
