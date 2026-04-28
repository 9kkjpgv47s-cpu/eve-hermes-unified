#!/usr/bin/env node
/**
 * H5: machine-checkable tenant isolation invariants for unified memory keys.
 * Mirrors src/memory/unified-memory-store.ts storageKey semantics.
 */
function normalizeMemoryKeyParts({ lane, namespace, key, tenantId }) {
  const ns = String(namespace ?? "").trim();
  const k = String(key ?? "").trim();
  const t = tenantId === undefined || tenantId === null ? "" : String(tenantId).trim();
  if (!["eve", "hermes", "shared"].includes(lane)) {
    throw new Error(`invalid lane: ${lane}`);
  }
  if (!ns) {
    throw new Error("namespace required");
  }
  if (!k) {
    throw new Error("key required");
  }
  return { lane, namespace: ns, key: k, tenantId: t || undefined };
}

function storageKey(target) {
  const n = normalizeMemoryKeyParts(target);
  if (!n.tenantId) {
    return `${n.lane}::${n.namespace}::${n.key}`;
  }
  return `tenant:${n.tenantId}::${n.lane}::${n.namespace}::${n.key}`;
}

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

function main() {
  const kDefault = storageKey({ lane: "eve", namespace: "n", key: "k" });
  const kA = storageKey({ lane: "eve", namespace: "n", key: "k", tenantId: "tenant-a" });
  const kB = storageKey({ lane: "eve", namespace: "n", key: "k", tenantId: "tenant-b" });
  assert(kDefault === "eve::n::k", "legacy key shape");
  assert(kA.startsWith("tenant:tenant-a::"), "tenant prefix A");
  assert(kB.startsWith("tenant:tenant-b::"), "tenant prefix B");
  assert(kA !== kB, "different tenants must not collide");
  assert(kA !== kDefault, "tenant-scoped key must not equal legacy key for same logical tuple");
  process.stdout.write("ok: H5 tenant memory key invariants validated.\n");
}

try {
  main();
} catch (e) {
  process.stderr.write(`${String(e?.message ?? e)}\n`);
  process.exitCode = 1;
}
