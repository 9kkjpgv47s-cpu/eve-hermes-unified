import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
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

export type UnifiedMemoryStoreKind = "memory" | "file" | "wal-file";

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

async function writeFileAtomic(targetPath: string, data: string): Promise<void> {
  await mkdir(path.dirname(targetPath), { recursive: true });
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const tmp = path.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(tmp, data, "utf8");
  await rename(tmp, targetPath);
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
    await writeFileAtomic(this.filePath, serializeRecordMap(this.records));
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

type WalRecord =
  | { op: "set"; entry: UnifiedMemoryEntry }
  | { op: "delete"; storageKey: string };

const DEFAULT_WAL_COMPACT_EVERY = 32;

function parseWalLine(line: string): WalRecord | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const op = (parsed as { op?: string }).op;
    if (op === "delete" && typeof (parsed as { storageKey?: string }).storageKey === "string") {
      return { op: "delete", storageKey: (parsed as { storageKey: string }).storageKey };
    }
    if (op === "set") {
      const entry = (parsed as { entry?: unknown }).entry;
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const e = entry as Partial<UnifiedMemoryEntry>;
      if (
        (e.lane === "eve" || e.lane === "hermes" || e.lane === "shared") &&
        typeof e.namespace === "string" &&
        typeof e.key === "string" &&
        typeof e.value === "string" &&
        typeof e.updatedAtIso === "string"
      ) {
        return { op: "set", entry: e as UnifiedMemoryEntry };
      }
    }
  } catch {
    return null;
  }
  return null;
}

function applyWalRecord(records: Map<string, UnifiedMemoryEntry>, record: WalRecord): void {
  if (record.op === "set") {
    records.set(storageKey(record.entry), cloneEntry(record.entry));
    return;
  }
  records.delete(record.storageKey);
}

/**
 * Append-only WAL plus periodic atomic snapshot compaction. Survives process crash
 * between snapshot writes by replaying `${filePath}.wal.jsonl` on startup.
 */
export class WalFileUnifiedMemoryStore implements UnifiedMemoryStore {
  private readonly records = new Map<string, UnifiedMemoryEntry>();
  private loaded = false;
  private writeChain = Promise.resolve();
  private readonly snapshotPath: string;
  private readonly walPath: string;
  private mutationsSinceCompact = 0;
  private readonly compactEvery: number;

  constructor(
    filePath: string,
    options?: { compactEvery?: number },
  ) {
    this.snapshotPath = filePath;
    this.walPath = `${filePath}.wal.jsonl`;
    const n = options?.compactEvery ?? DEFAULT_WAL_COMPACT_EVERY;
    this.compactEvery = Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_WAL_COMPACT_EVERY;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }
    try {
      const raw = await readFile(this.snapshotPath, "utf8");
      for (const entry of parseRecordList(raw)) {
        this.records.set(storageKey(entry), cloneEntry(entry));
      }
    } catch {
      // Missing snapshot starts empty.
    }
    try {
      const walRaw = await readFile(this.walPath, "utf8");
      for (const line of walRaw.split(/\r?\n/)) {
        const rec = parseWalLine(line);
        if (rec) {
          applyWalRecord(this.records, rec);
        }
      }
    } catch {
      // Missing WAL is fine.
    }
    this.loaded = true;
  }

  private async queueWrite(operation: () => Promise<void>): Promise<void> {
    this.writeChain = this.writeChain.then(operation);
    await this.writeChain;
  }

  private async appendWal(record: WalRecord): Promise<void> {
    await mkdir(path.dirname(this.walPath), { recursive: true });
    await appendFile(this.walPath, `${JSON.stringify(record)}\n`, "utf8");
  }

  private async compactIfNeeded(): Promise<void> {
    if (this.mutationsSinceCompact < this.compactEvery) {
      return;
    }
    this.mutationsSinceCompact = 0;
    await writeFileAtomic(this.snapshotPath, serializeRecordMap(this.records));
    await writeFile(this.walPath, "", "utf8");
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
    const entry: UnifiedMemoryEntry = {
      ...normalized,
      value,
      updatedAtIso: new Date().toISOString(),
      metadata: metadata ? { ...metadata } : undefined,
    };
    await this.ensureLoaded();
    await this.queueWrite(async () => {
      await this.appendWal({ op: "set", entry: cloneEntry(entry) });
      this.records.set(storageKey(normalized), cloneEntry(entry));
      this.mutationsSinceCompact += 1;
      await this.compactIfNeeded();
    });
    return cloneEntry(entry);
  }

  async delete(target: UnifiedMemoryKey): Promise<boolean> {
    const normalized = normalizeMemoryKey(target);
    const key = storageKey(normalized);
    await this.ensureLoaded();
    let deleted = false;
    await this.queueWrite(async () => {
      await this.appendWal({ op: "delete", storageKey: key });
      deleted = this.records.delete(key);
      if (deleted) {
        this.mutationsSinceCompact += 1;
        await this.compactIfNeeded();
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

export function createUnifiedMemoryStoreFromEnv(
  kind: UnifiedMemoryStoreKind,
  filePath: string,
): UnifiedMemoryStore {
  if (kind === "file") {
    return new FileUnifiedMemoryStore(filePath);
  }
  if (kind === "wal-file") {
    return new WalFileUnifiedMemoryStore(filePath);
  }
  return new InMemoryUnifiedMemoryStore();
}
