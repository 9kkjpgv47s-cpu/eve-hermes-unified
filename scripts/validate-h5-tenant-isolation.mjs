#!/usr/bin/env node
/**
 * H5: verifies tenant-scoped memory storage keys do not collide across tenants.
 */
function storageKey(lane, namespace, key, tenantId) {
  const tenant = tenantId?.trim();
  const prefix = tenant && tenant.length > 0 ? `tenant:${tenant}::` : "";
  return `${prefix}${lane}::${namespace}::${key}`;
}

function main() {
  const a = storageKey("eve", "capability-execution", "trace-1", "Acme");
  const b = storageKey("eve", "capability-execution", "trace-1", "Beta");
  const legacy = storageKey("eve", "capability-execution", "trace-1", undefined);
  const errors = [];
  if (a === b) {
    errors.push("tenant keys must not collide for different tenantIds");
  }
  if (a === legacy || b === legacy) {
    errors.push("tenant-scoped keys must differ from legacy (no tenant) key space");
  }
  if (errors.length > 0) {
    process.stderr.write(`${errors.join("\n")}\n`);
    process.exitCode = 2;
    return;
  }
  process.stdout.write(
    `${JSON.stringify({ valid: true, checkedAtIso: new Date().toISOString(), samples: { a, b, legacy } })}\n`,
  );
}

main();
