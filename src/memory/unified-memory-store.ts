import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, rename, truncate, writeFile } from "node:fs/promises";
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

export type FileMemoryStoreOptions = {
  /** When true with a journal path, re-read disk after persist and verify SHA256 matches in-memory map. */
  verifyPersist?: boolean;
};

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

function hashSnapshotJson(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function mapsEqual(
  a: Map<string, UnifiedMemoryEntry>,
  b: Map<string, UnifiedMemoryEntry>,
): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const [key, entry] of a) {
    const other = b.get(key);
    if (!other) {
      return false;
    }
    if (
      other.lane !== entry.lane ||
      other.namespace !== entry.namespace ||
      other.key !== entry.key ||
      other.value !== entry.value ||
      other.updatedAtIso !== entry.updatedAtIso
    ) {
      return false;
    }
    const ma = entry.metadata ? JSON.stringify(entry.metadata) : "";
    const mb = other.metadata ? JSON.stringify(other.metadata) : "";
    if (ma !== mb) {
      return false;
    }
  }
  return true;
}

async function verifyPersistAgainstDisk(
  filePath: string,
  expected: Map<string, UnifiedMemoryEntry>,
): Promise<void> {
  const raw = await readFile(filePath, "utf8");
  const reloaded = new Map<string, UnifiedMemoryEntry>();
  for (const entry of parseRecordList(raw)) {
    reloaded.set(storageKey(entry), cloneEntry(entry));
  }
  if (!mapsEqual(expected, reloaded)) {
    throw new Error("unified_memory_persist_verify_failed: snapshot mismatch after persist");
  }
  const expectedHash = hashSnapshotJson(serializeRecordMap(expected));
  const diskHash = hashSnapshotJson(raw);
  if (expectedHash !== diskHash) {
    throw new Error("unified_memory_persist_verify_failed: snapshot hash mismatch");
  }
}

type MemoryWalRecord =
  | {
      v: 1;
      op: "set";
      lane: MemoryLane;
      namespace: string;
      key: string;
      value: string;
      updatedAtIso: string;
      metadata?: Record<string, string>;
    }
  | { v: 1; op: "delete"; lane: MemoryLane; namespace: string; key: string };

function parseWalLine(line: string): MemoryWalRecord | undefined {
  const trimmed = line.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(trimmed) as MemoryWalRecord;
    if (parsed?.v !== 1 || (parsed.op !== "set" && parsed.op !== "delete")) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

async function appendMemoryWal(journalPath: string, record: MemoryWalRecord): Promise<void> {
  await mkdir(path.dirname(journalPath), { recursive: true });
  await appendFile(journalPath, `${JSON.stringify(record)}\n`, "utf8");
}

function applyWalRecord(records: Map<string, UnifiedMemoryEntry>, record: MemoryWalRecord): void {
  if (record.op === "delete") {
    const key = storageKey(
      normalizeMemoryKey({ lane: record.lane, namespace: record.namespace, key: record.key }),
    );
    records.delete(key);
    return;
  }
  const normalized = normalizeMemoryKey({
    lane: record.lane,
    namespace: record.namespace,
    key: record.key,
  });
  records.set(storageKey(normalized), {
    ...normalized,
    value: record.value,
    updatedAtIso: record.updatedAtIso,
    metadata: record.metadata ? { ...record.metadata } : undefined,
  });
}

async function replayMemoryWal(journalPath: string, records: Map<string, UnifiedMemoryEntry>): Promise<void> {
  let raw = "";
  try {
    raw = await readFile(journalPath, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const rec = parseWalLine(line);
    if (rec) {
      applyWalRecord(records, rec);
    }
  }
}

async function clearMemoryWal(journalPath: string): Promise<void> {
  try {
    await truncate(journalPath, 0);
  } catch {
    // optional file
  }
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

  constructor(
    private readonly filePath: string,
    private readonly journalPath?: string,
    private readonly options?: FileMemoryStoreOptions,
  ) {}

  private journalFile(): string | undefined {
    return this.journalPath && this.journalPath.length > 0 ? this.journalPath : undefined;
  }

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
    const j = this.journalFile();
    if (j) {
      await replayMemoryWal(j, this.records);
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const data = serializeRecordMap(this.records);
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmpPath, data, "utf8");
    await rename(tmpPath, this.filePath);
    const j = this.journalFile();
    if (j) {
      await clearMemoryWal(j);
    }
    if (this.options?.verifyPersist) {
      await verifyPersistAgainstDisk(this.filePath, this.records);
    }
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
    const j = this.journalFile();
    await this.queueWrite(async () => {
      if (j) {
        await appendMemoryWal(j, {
          v: 1,
          op: "set",
          lane: entry.lane,
          namespace: entry.namespace,
          key: entry.key,
          value: entry.value,
          updatedAtIso: entry.updatedAtIso,
          metadata: entry.metadata,
        });
      }
      this.records.set(storageKey(normalized), entry);
      await this.persist();
    });
    return cloneEntry(entry);
  }

  async delete(target: UnifiedMemoryKey): Promise<boolean> {
    const normalized = normalizeMemoryKey(target);
    await this.ensureLoaded();
    let deleted = false;
    const j = this.journalFile();
    await this.queueWrite(async () => {
      deleted = this.records.delete(storageKey(normalized));
      if (deleted && j) {
        await appendMemoryWal(j, {
          v: 1,
          op: "delete",
          lane: normalized.lane,
          namespace: normalized.namespace,
          key: normalized.key,
        });
      }
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

export function createUnifiedMemoryStoreFromEnv(
  kind: UnifiedMemoryStoreKind,
  filePath: string,
  journalPath?: string,
  options?: FileMemoryStoreOptions,
): UnifiedMemoryStore {
  if (kind === "file") {
    return new FileUnifiedMemoryStore(filePath, journalPath, options);
  }
  return new InMemoryUnifiedMemoryStore();
}
