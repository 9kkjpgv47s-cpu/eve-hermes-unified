import type {
  UnifiedMemoryEntry,
  UnifiedMemoryKey,
  UnifiedMemoryListQuery,
  UnifiedMemoryStore,
} from "./unified-memory-store.js";

function prefixNamespace(tenantId: string, namespace: string): string {
  const t = tenantId.trim();
  if (!t) {
    return namespace;
  }
  return `tenant:${t}:${namespace}`;
}

/**
 * Prefixes memory namespaces with a tenant segment when tenantId is non-empty.
 * Empty tenantId preserves legacy flat namespaces.
 */
export class TenantScopedMemoryStore implements UnifiedMemoryStore {
  constructor(
    private readonly inner: UnifiedMemoryStore,
    private readonly tenantId: string,
  ) {}

  private mapKey(target: UnifiedMemoryKey): UnifiedMemoryKey {
    return {
      ...target,
      namespace: prefixNamespace(this.tenantId, target.namespace),
    };
  }

  private mapQuery(query?: UnifiedMemoryListQuery): UnifiedMemoryListQuery | undefined {
    if (!query) {
      return query;
    }
    if (!query.namespace) {
      return query;
    }
    return {
      ...query,
      namespace: prefixNamespace(this.tenantId, query.namespace),
    };
  }

  async get(target: UnifiedMemoryKey): Promise<UnifiedMemoryEntry | undefined> {
    return this.inner.get(this.mapKey(target));
  }

  async set(
    target: UnifiedMemoryKey,
    value: string,
    metadata?: Record<string, string>,
  ): Promise<UnifiedMemoryEntry> {
    return this.inner.set(this.mapKey(target), value, metadata);
  }

  async delete(target: UnifiedMemoryKey): Promise<boolean> {
    return this.inner.delete(this.mapKey(target));
  }

  async list(query?: UnifiedMemoryListQuery): Promise<UnifiedMemoryEntry[]> {
    return this.inner.list(this.mapQuery(query));
  }
}
