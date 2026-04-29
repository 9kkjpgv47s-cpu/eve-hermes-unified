import {
  createUnifiedMemoryStoreFromEnv,
  InMemoryUnifiedMemoryStore,
  type UnifiedMemoryEntry,
  type UnifiedMemoryKey,
  type UnifiedMemoryListQuery,
  type UnifiedMemoryStoreKind,
  type UnifiedMemoryStore,
} from "./unified-memory-store.js";

export class HermesMemoryAdapter implements UnifiedMemoryStore {
  constructor(private readonly backingStore: UnifiedMemoryStore = new InMemoryUnifiedMemoryStore()) {}

  async get(target: UnifiedMemoryKey): Promise<UnifiedMemoryEntry | undefined> {
    return this.backingStore.get({ ...target, lane: "hermes" });
  }

  async set(
    target: UnifiedMemoryKey,
    value: string,
    metadata?: Record<string, string>,
  ): Promise<UnifiedMemoryEntry> {
    return this.backingStore.set({ ...target, lane: "hermes" }, value, metadata);
  }

  async delete(target: UnifiedMemoryKey): Promise<boolean> {
    return this.backingStore.delete({ ...target, lane: "hermes" });
  }

  async list(query?: UnifiedMemoryListQuery): Promise<UnifiedMemoryEntry[]> {
    return this.backingStore.list({ ...query, lane: "hermes" });
  }
}

export function createInMemoryHermesStore(): UnifiedMemoryStore {
  return new InMemoryUnifiedMemoryStore();
}

export function createFileBackedHermesStore(filePath: string): UnifiedMemoryStore {
  return createUnifiedMemoryStoreFromEnv("file", filePath);
}

export function createHermesMemoryStoreFromEnv(
  kind: UnifiedMemoryStoreKind,
  filePath: string,
  options?: { serializeWrites?: boolean },
): UnifiedMemoryStore {
  return createUnifiedMemoryStoreFromEnv(kind, filePath, options);
}
