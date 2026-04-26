import {
  FileUnifiedMemoryStore,
  InMemoryUnifiedMemoryStore,
  type UnifiedMemoryEntry,
  type UnifiedMemoryKey,
  type UnifiedMemoryListQuery,
  type UnifiedMemoryStore,
} from "./unified-memory-store.js";

function withEveLane(target: UnifiedMemoryKey): UnifiedMemoryKey {
  return { ...target, lane: "eve" };
}

function withEveLaneQuery(query?: UnifiedMemoryListQuery): UnifiedMemoryListQuery {
  return { ...(query ?? {}), lane: "eve" };
}

export class EveMemoryAdapter implements UnifiedMemoryStore {
  constructor(private readonly store: UnifiedMemoryStore = new InMemoryUnifiedMemoryStore()) {}

  async get(target: UnifiedMemoryKey): Promise<UnifiedMemoryEntry | undefined> {
    return this.store.get(withEveLane(target));
  }

  async set(
    target: UnifiedMemoryKey,
    value: string,
    metadata?: Record<string, string>,
  ): Promise<UnifiedMemoryEntry> {
    return this.store.set(withEveLane(target), value, metadata);
  }

  async delete(target: UnifiedMemoryKey): Promise<boolean> {
    return this.store.delete(withEveLane(target));
  }

  async list(query?: UnifiedMemoryListQuery): Promise<UnifiedMemoryEntry[]> {
    return this.store.list(withEveLaneQuery(query));
  }
}

export function createInMemoryEveStore(): UnifiedMemoryStore {
  return new InMemoryUnifiedMemoryStore();
}

export function createFileBackedEveStore(filePath: string): UnifiedMemoryStore {
  return new FileUnifiedMemoryStore(filePath);
}
