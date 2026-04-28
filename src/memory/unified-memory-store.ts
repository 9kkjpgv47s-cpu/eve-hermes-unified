import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LaneId } from "../contracts/types.js";

export type MemoryLane = LaneId | "shared";

export type UnifiedMemoryKey = {
  lane: MemoryLane;
  namespace: string;
  key: string;
  /** H5: when set, isolates storage from other tenants (default / unset shares legacy key space). */
  tenantId?: string;
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
  tenantId?: string;
};

export interface UnifiedMemoryStore {
  get(target: UnifiedMemoryKey): Promise<UnifiedMemoryEntry | undefined>;
  set(
    target: UnifiedMemoryKey,
    value: string,
    metadata?: Record<string, string>,
    options?: { updatedAtIso?: string },
  ): Promise<UnifiedMemoryEntry>;
  delete(target: UnifiedMemoryKey): Promise<boolean>;
  list(query?: UnifiedMemoryListQuery): Promise<UnifiedMemoryEntry[]>;
}

export type UnifiedMemoryStoreKind = "memory" | "file";

export type UnifiedMemoryStoreFactoryOptions = {
  dualWriteShadowFilePath?: string;
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
  const tenant = target.tenantId?.trim();
  return {
    lane: target.lane,
    namespace: target.namespace.trim(),
    key: target.key.trim(),
    ...(tenant && tenant.length > 0 ? { tenantId: tenant } : {}),
  };
}

function storageKey(target: UnifiedMemoryKey): string {
  const tenant = target.tenantId?.trim();
  const prefix = tenant && tenant.length > 0 ? `tenant:${tenant}::` : "";
  return `${prefix}${target.lane}::${target.namespace}::${target.key}`;
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

export async function writeJsonFileAtomically(filePath: string, payload: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  await writeFile(tmp, payload, "utf8");
  await rename(tmp, filePath);
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
      typeof entry.updatedAtIso === "string" &&
      (entry.tenantId === undefined || typeof entry.tenantId === "string")
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
    options?: { updatedAtIso?: string },
  ): Promise<UnifiedMemoryEntry> {
    const normalized = normalizeMemoryKey(target);
    const entry: UnifiedMemoryEntry = {
      ...normalized,
      value,
      updatedAtIso: options?.updatedAtIso ?? new Date().toISOString(),
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
    const tenantId = query?.tenantId?.trim();

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
      if (tenantId) {
        const entryTenant = entry.tenantId?.trim() ?? "";
        if (entryTenant !== tenantId) {
          return false;
        }
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
    options?: { updatedAtIso?: string },
  ): Promise<UnifiedMemoryEntry> {
    const normalized = normalizeMemoryKey(target);
    await this.ensureLoaded();
    const entry: UnifiedMemoryEntry = {
      ...normalized,
      value,
      updatedAtIso: options?.updatedAtIso ?? new Date().toISOString(),
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
    const tenantId = query?.tenantId?.trim();

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
      if (tenantId) {
        const entryTenant = entry.tenantId?.trim() ?? "";
        if (entryTenant !== tenantId) {
          return false;
        }
      }
      return true;
    });
    return matches
      .map((entry) => cloneEntry(entry))
      .sort((a, b) => a.updatedAtIso.localeCompare(b.updatedAtIso));
  }
}

export class DualWriteUnifiedMemoryStore implements UnifiedMemoryStore {
  constructor(
    private readonly primary: FileUnifiedMemoryStore,
    private readonly shadow: FileUnifiedMemoryStore,
  ) {}

  async get(target: UnifiedMemoryKey): Promise<UnifiedMemoryEntry | undefined> {
    return this.primary.get(target);
  }

  async set(
    target: UnifiedMemoryKey,
    value: string,
    metadata?: Record<string, string>,
    options?: { updatedAtIso?: string },
  ): Promise<UnifiedMemoryEntry> {
    const entry = await this.primary.set(target, value, metadata, options);
    await this.shadow.set(target, value, metadata, { updatedAtIso: entry.updatedAtIso });
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
  options?: UnifiedMemoryStoreFactoryOptions,
): UnifiedMemoryStore {
  if (kind === "file") {
    const primary = new FileUnifiedMemoryStore(filePath);
    const shadowPath = options?.dualWriteShadowFilePath?.trim();
    if (shadowPath && shadowPath.length > 0) {
      if (path.resolve(shadowPath) === path.resolve(filePath)) {
        throw new Error("dualWriteShadowFilePath must differ from unified memory file path.");
      }
      return new DualWriteUnifiedMemoryStore(primary, new FileUnifiedMemoryStore(shadowPath));
    }
    return primary;
  }
  return new InMemoryUnifiedMemoryStore();
}
