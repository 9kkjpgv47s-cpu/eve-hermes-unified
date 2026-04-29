import type {
  UnifiedMemoryEntry,
  UnifiedMemoryKey,
  UnifiedMemoryListQuery,
  UnifiedMemoryStore,
} from "./unified-memory-store.js";
import { normalizeMemoryKey } from "./unified-memory-store.js";

function prefixNamespace(tenantId: string, target: UnifiedMemoryKey): UnifiedMemoryKey {
  const normalized = normalizeMemoryKey(target);
  const prefix = tenantId.trim();
  if (!prefix) {
    return normalized;
  }
  return {
    ...normalized,
    namespace: `${prefix}::${normalized.namespace}`,
  };
}

function prefixQuery(tenantId: string, query?: UnifiedMemoryListQuery): UnifiedMemoryListQuery | undefined {
  const prefix = tenantId.trim();
  if (!prefix) {
    return query;
  }
  if (!query?.namespace?.trim()) {
    return undefined;
  }
  return {
    ...query,
    namespace: `${prefix}::${query.namespace.trim()}`,
  };
}

/**
 * Wraps a backing store so keys are partitioned by tenant (namespace prefix).
 */
export class TenantScopedUnifiedMemoryStore implements UnifiedMemoryStore {
  constructor(
    private readonly inner: UnifiedMemoryStore,
    private readonly tenantId: string,
  ) {}

  async get(target: UnifiedMemoryKey): Promise<UnifiedMemoryEntry | undefined> {
    return this.inner.get(prefixNamespace(this.tenantId, target));
  }

  async set(
    target: UnifiedMemoryKey,
    value: string,
    metadata?: Record<string, string>,
  ): Promise<UnifiedMemoryEntry> {
    return this.inner.set(prefixNamespace(this.tenantId, target), value, metadata);
  }

  async delete(target: UnifiedMemoryKey): Promise<boolean> {
    return this.inner.delete(prefixNamespace(this.tenantId, target));
  }

  async list(query?: UnifiedMemoryListQuery): Promise<UnifiedMemoryEntry[]> {
    const scoped = prefixQuery(this.tenantId, query);
    if (this.tenantId.trim() && !scoped) {
      return [];
    }
    return this.inner.list(scoped ?? query);
  }
}
