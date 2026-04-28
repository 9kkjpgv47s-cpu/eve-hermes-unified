import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LaneId } from "../contracts/types.js";

export type MemoryLane = LaneId | "shared";

export type UnifiedMemoryKey = {
  lane: MemoryLane;
  namespace: string;
  key: string;
};

export type UnifiedMemoryEntry = UnifiedMemoryKey & {
  value: string;
  updatedAtIso: string;
  metadata?: Record<string, string>;
};

export type UnifiedMemoryListQuery = {
  lane?: MemoryLane;
  namespace?: string;
  keyPrefix?: string;
};

export interface UnifiedMemoryStore {
  get(target: UnifiedMemoryKey): Promise<UnifiedMemoryEntry | undefined>;
  set(
    target: UnifiedMemoryKey,
    value: string,
    metadata?: Record<string, string>,
  ): Promise<UnifiedMemoryEntry>;
  delete(target: UnifiedMemoryKey): Promise<boolean>;
  list(query?: UnifiedMemoryListQuery): Promise<UnifiedMemoryEntry[]>;
}

export type UnifiedMemoryStoreKind = "memory" | "file";

export type UnifiedMemoryStoreFactoryOptions = {
  /** When set with `kind=file`, every mutating write updates this second file-backed store after the primary. */
  dualWriteShadowFilePath?: string;
};

async function writeJsonFileAtomically(filePath: string, body: string): Promise<void> {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
  const base = path.basename(filePath);
  const tmp = path.join(dir, `.${base}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
  await writeFile(tmp, body, "utf8");
  await rename(tmp, filePath);
}

export function validateUnifiedMemoryKey(target: UnifiedMemoryKey): void {
  if (target.lane !== "eve" && target.lane !== "hermes" && target.lane !== "shared") {
    throw new Error("UnifiedMemoryKey.lane must be eve|hermes|shared.");
  }
  if (target.namespace.trim().length === 0) {
    throw new Error("UnifiedMemoryKey.namespace is required.");
  }
  if (target.key.trim().length === 0) {
    throw new Error("UnifiedMemoryKey.key is required.");
  }
}

export function normalizeMemoryKey(target: UnifiedMemoryKey): UnifiedMemoryKey {
  validateUnifiedMemoryKey(target);
  return {
    lane: target.lane,
    namespace: target.namespace.trim(),
    key: target.key.trim(),
  };
}

function storageKey(target: UnifiedMemoryKey): string {
  return `${target.lane}::${target.namespace}::${target.key}`;
}

function cloneEntry(entry: UnifiedMemoryEntry): UnifiedMemoryEntry {
  return {
    ...entry,
    metadata: entry.metadata ? { ...entry.metadata } : undefined,
  };
}

function serializeRecordMap(records: Map<string, UnifiedMemoryEntry>): string {
  return JSON.stringify([...records.values()], null, 2);
}

function parseRecordList(raw: string): UnifiedMemoryEntry[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter((item): item is UnifiedMemoryEntry => {
    if (!item || typeof item !== "object") {
      return false;
    }
    const entry = item as Partial<UnifiedMemoryEntry>;
    return (
      (entry.lane === "eve" || entry.lane === "hermes" || entry.lane === "shared") &&
      typeof entry.namespace === "string" &&
      typeof entry.key === "string" &&
      typeof entry.value === "string" &&
      typeof entry.updatedAtIso === "string"
    );
  });
}

export function createMemoryStorageKey(target: UnifiedMemoryKey): string {
  return storageKey(normalizeMemoryKey(target));
}

export class InMemoryUnifiedMemoryStore implements UnifiedMemoryStore {
  private readonly records = new Map<string, UnifiedMemoryEntry>();

  async get(target: UnifiedMemoryKey): Promise<UnifiedMemoryEntry | undefined> {
    const normalized = normalizeMemoryKey(target);
    const value = this.records.get(storageKey(normalized));
    return value ? cloneEntry(value) : undefined;
  }

  async set(
    target: UnifiedMemoryKey,
    value: string,
    metadata?: Record<string, string>,
  ): Promise<UnifiedMemoryEntry> {
    const normalized = normalizeMemoryKey(target);
    const entry: UnifiedMemoryEntry = {
      ...normalized,
      value,
      updatedAtIso: new Date().toISOString(),
      metadata: metadata ? { ...metadata } : undefined,
    };
    this.records.set(storageKey(normalized), entry);
    return cloneEntry(entry);
  }

  async delete(target: UnifiedMemoryKey): Promise<boolean> {
    const normalized = normalizeMemoryKey(target);
    return this.records.delete(storageKey(normalized));
  }

  async list(query?: UnifiedMemoryListQuery): Promise<UnifiedMemoryEntry[]> {
    const lane = query?.lane;
    const namespace = query?.namespace;
    const keyPrefix = query?.keyPrefix;

    const matches = [...this.records.values()].filter((entry) => {
      if (lane && entry.lane !== lane) {
        return false;
      }
      if (namespace && entry.namespace !== namespace) {
        return false;
      }
      if (keyPrefix && !entry.key.startsWith(keyPrefix)) {
        return false;
      }
      return true;
    });

    return matches
      .map((entry) => cloneEntry(entry))
      .sort((a, b) => a.updatedAtIso.localeCompare(b.updatedAtIso));
  }
}

export class FileUnifiedMemoryStore implements UnifiedMemoryStore {
  private readonly records = new Map<string, UnifiedMemoryEntry>();
  private loaded = false;
  private writeChain = Promise.resolve();

  constructor(private readonly filePath: string) {}

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }
    try {
      const raw = await readFile(this.filePath, "utf8");
      for (const entry of parseRecordList(raw)) {
        this.records.set(storageKey(entry), cloneEntry(entry));
      }
    } catch {
      // Missing/invalid file initializes empty store.
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    await writeJsonFileAtomically(this.filePath, serializeRecordMap(this.records));
  }

  private async queueWrite(operation: () => Promise<void>): Promise<void> {
    this.writeChain = this.writeChain.then(operation);
    await this.writeChain;
  }

  async get(target: UnifiedMemoryKey): Promise<UnifiedMemoryEntry | undefined> {
    const normalized = normalizeMemoryKey(target);
    await this.ensureLoaded();
    const value = this.records.get(storageKey(normalized));
    return value ? cloneEntry(value) : undefined;
  }

  async set(
    target: UnifiedMemoryKey,
    value: string,
    metadata?: Record<string, string>,
  ): Promise<UnifiedMemoryEntry> {
    const normalized = normalizeMemoryKey(target);
    await this.ensureLoaded();
    const entry: UnifiedMemoryEntry = {
      ...normalized,
      value,
      updatedAtIso: new Date().toISOString(),
      metadata: metadata ? { ...metadata } : undefined,
    };
    await this.queueWrite(async () => {
      this.records.set(storageKey(normalized), entry);
      await this.persist();
    });
    return cloneEntry(entry);
  }

  async delete(target: UnifiedMemoryKey): Promise<boolean> {
    const normalized = normalizeMemoryKey(target);
    await this.ensureLoaded();
    let deleted = false;
    await this.queueWrite(async () => {
      deleted = this.records.delete(storageKey(normalized));
      if (deleted) {
        await this.persist();
      }
    });
    return deleted;
  }

  async list(query?: UnifiedMemoryListQuery): Promise<UnifiedMemoryEntry[]> {
    await this.ensureLoaded();
    const lane = query?.lane;
    const namespace = query?.namespace;
    const keyPrefix = query?.keyPrefix;

    const matches = [...this.records.values()].filter((entry) => {
      if (lane && entry.lane !== lane) {
        return false;
      }
      if (namespace && entry.namespace !== namespace) {
        return false;
      }
      if (keyPrefix && !entry.key.startsWith(keyPrefix)) {
        return false;
      }
      return true;
    });
    return matches
      .map((entry) => cloneEntry(entry))
      .sort((a, b) => a.updatedAtIso.localeCompare(b.updatedAtIso));
  }
}

/**
 * Writes through `primary` for reads/lists; on `set`/`delete`, updates `primary` then `shadow`
 * so operators can keep a second on-disk copy (different volume) for crash-recovery experiments.
 */
export class DualWriteUnifiedMemoryStore implements UnifiedMemoryStore {
  constructor(
    private readonly primary: UnifiedMemoryStore,
    private readonly shadow: UnifiedMemoryStore,
  ) {}

  async get(target: UnifiedMemoryKey): Promise<UnifiedMemoryEntry | undefined> {
    return this.primary.get(target);
  }

  async set(
    target: UnifiedMemoryKey,
    value: string,
    metadata?: Record<string, string>,
  ): Promise<UnifiedMemoryEntry> {
    const entry = await this.primary.set(target, value, metadata);
    await this.shadow.set(target, value, metadata);
    return entry;
  }

  async delete(target: UnifiedMemoryKey): Promise<boolean> {
    const deleted = await this.primary.delete(target);
    await this.shadow.delete(target);
    return deleted;
  }

  async list(query?: UnifiedMemoryListQuery): Promise<UnifiedMemoryEntry[]> {
    return this.primary.list(query);
  }
}

export function createUnifiedMemoryStoreFromEnv(
  kind: UnifiedMemoryStoreKind,
  filePath: string,
  options: UnifiedMemoryStoreFactoryOptions = {},
): UnifiedMemoryStore {
  if (kind === "file") {
    const primary = new FileUnifiedMemoryStore(filePath);
    const shadowPath = String(options.dualWriteShadowFilePath ?? "").trim();
    if (shadowPath.length > 0) {
      const resolvedPrimary = path.resolve(filePath);
      const resolvedShadow = path.resolve(shadowPath);
      if (resolvedShadow !== resolvedPrimary) {
        return new DualWriteUnifiedMemoryStore(primary, new FileUnifiedMemoryStore(shadowPath));
      }
    }
    return primary;
  }
  return new InMemoryUnifiedMemoryStore();
}
