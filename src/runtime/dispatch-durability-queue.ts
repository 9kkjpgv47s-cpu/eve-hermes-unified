import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { UnifiedDispatchResult, UnifiedMessageEnvelope } from "../contracts/types.js";
import { validateEnvelope } from "../contracts/validate.js";
import type { UnifiedRuntime } from "./unified-dispatch.js";
import { dispatchUnifiedEnvelope } from "./unified-dispatch.js";

export type DispatchQueueEntryStatus = "pending" | "dispatched" | "failed";

export type DispatchQueueEntry = {
  id: string;
  status: DispatchQueueEntryStatus;
  attempts: number;
  createdAtIso: string;
  updatedAtIso: string;
  lastError?: string;
  envelope: UnifiedMessageEnvelope;
};

export type DispatchQueueFile = {
  schemaVersion: "v1";
  entries: DispatchQueueEntry[];
};

function parseQueueFile(raw: string): DispatchQueueFile {
  try {
    const parsed = JSON.parse(raw) as DispatchQueueFile;
    if (parsed?.schemaVersion !== "v1" || !Array.isArray(parsed.entries)) {
      return { schemaVersion: "v1", entries: [] };
    }
    return parsed;
  } catch {
    return { schemaVersion: "v1", entries: [] };
  }
}

export class FileDispatchDurabilityQueue {
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  private async load(): Promise<DispatchQueueFile> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return parseQueueFile(raw);
    } catch {
      return { schemaVersion: "v1", entries: [] };
    }
  }

  private async persist(data: DispatchQueueFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }

  private async mutate(mutator: (data: DispatchQueueFile) => void): Promise<void> {
    this.chain = this.chain.then(async () => {
      const data = await this.load();
      mutator(data);
      await this.persist(data);
    });
    await this.chain;
  }

  async appendEnvelope(envelopeInput: UnifiedMessageEnvelope): Promise<DispatchQueueEntry> {
    const envelope = validateEnvelope(envelopeInput);
    const id = `dq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const now = new Date().toISOString();
    const entry: DispatchQueueEntry = {
      id,
      status: "pending",
      attempts: 0,
      createdAtIso: now,
      updatedAtIso: now,
      envelope,
    };
    await this.mutate((data) => {
      data.entries.push(entry);
    });
    return entry;
  }

  async listPending(): Promise<DispatchQueueEntry[]> {
    const data = await this.load();
    return data.entries.filter((e) => e.status === "pending");
  }

  async markDispatched(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.mutate((data) => {
      const entry = data.entries.find((e) => e.id === id);
      if (entry) {
        entry.status = "dispatched";
        entry.updatedAtIso = now;
      }
    });
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    const now = new Date().toISOString();
    await this.mutate((data) => {
      const entry = data.entries.find((e) => e.id === id);
      if (entry) {
        entry.status = "failed";
        entry.updatedAtIso = now;
        entry.lastError = errorMessage.slice(0, 2000);
      }
    });
  }

  async incrementAttempt(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.mutate((data) => {
      const entry = data.entries.find((e) => e.id === id);
      if (entry) {
        entry.attempts += 1;
        entry.updatedAtIso = now;
      }
    });
  }
}

export async function replayPendingDispatches(
  queue: FileDispatchDurabilityQueue,
  runtime: UnifiedRuntime,
): Promise<{ replayed: number; results: UnifiedDispatchResult[]; errors: { id: string; message: string }[] }> {
  const pending = await queue.listPending();
  const results: UnifiedDispatchResult[] = [];
  const errors: { id: string; message: string }[] = [];

  for (const entry of pending) {
    await queue.incrementAttempt(entry.id);
    try {
      const result = await dispatchUnifiedEnvelope(runtime, entry.envelope);
      results.push(result);
      await queue.markDispatched(entry.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ id: entry.id, message });
      await queue.markFailed(entry.id, message);
    }
  }

  return { replayed: results.length + errors.length, results, errors };
}
