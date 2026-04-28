import type { LaneId } from "../contracts/types.js";

/** Keys scoped to a chat session (long-lived working set). */
export type MemoryReadScope = {
  chatId: string;
  traceId: string;
  messageId: string;
};

/** Append-only audit line for convergence tracing (optional). */
export type MemoryDispatchEvent = MemoryReadScope & {
  lane: LaneId;
  phase: "primary" | "fallback";
  status: "pass" | "failed";
  reason: string;
};

/**
 * Phase-3 convergence surface: one store API behind Eve/Hermes adapters later.
 * Default implementation is in-memory for CI and local drill.
 */
export interface UnifiedMemoryStore {
  readWorkingSet(scope: MemoryReadScope): Promise<Record<string, string>>;
  appendDispatchEvent(event: MemoryDispatchEvent): Promise<void>;
}

export class InMemoryUnifiedMemoryStore implements UnifiedMemoryStore {
  private readonly chatKv = new Map<string, Map<string, string>>();
  private readonly events: MemoryDispatchEvent[] = [];

  async readWorkingSet(scope: MemoryReadScope): Promise<Record<string, string>> {
    const row = this.chatKv.get(scope.chatId);
    if (!row) {
      return {};
    }
    return Object.fromEntries(row);
  }

  /** Test and gateway hook: seed keys for a chat. */
  setChatKey(chatId: string, key: string, value: string): void {
    let row = this.chatKv.get(chatId);
    if (!row) {
      row = new Map();
      this.chatKv.set(chatId, row);
    }
    row.set(key, value);
  }

  async appendDispatchEvent(event: MemoryDispatchEvent): Promise<void> {
    this.events.push(event);
  }

  getEvents(): readonly MemoryDispatchEvent[] {
    return this.events;
  }
}
