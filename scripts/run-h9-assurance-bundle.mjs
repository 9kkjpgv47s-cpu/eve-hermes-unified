#!/usr/bin/env node
/**
 * Horizon H9 assurance bundle: H8 gates plus unified memory atomic persistence proof.
 *
 * Unified adapter entrypoints (**`validate:unified-entrypoints`**) are enforced in **`run-h22-assurance-bundle.mjs`** after **`validate:all`** + **`npm run build`**.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H9_ASSURANCE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.H9_ASSURANCE_OUT ?? path.join(evidenceDir, `h9-assurance-bundle-${stamp}.json`);

function runStep(id, argv) {
  const r = spawnSync(argv[0], argv.slice(1), {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  const exitCode = r.status ?? 1;
  return {
    id,
    exitCode,
    pass: exitCode === 0,
    stderr: (r.stderr ?? "").slice(0, 2000),
  };
}

const horizonStatus = runStep("validate_horizon_status", [
  process.execPath,
  path.join(root, "scripts/validate-horizon-status.mjs"),
  "--file",
  path.join(root, "docs/HORIZON_STATUS.json"),
]);
const tenantIsolation = runStep("validate_tenant_isolation", [
  process.execPath,
  path.join(root, "scripts/validate-tenant-isolation.mjs"),
]);
const regionFailover = runStep("rehearse_region_failover", [
  "bash",
  path.join(root, "scripts/region-failover-rehearsal.sh"),
]);
const auditRotation = runStep("audit_log_rotation_tests", [
  process.execPath,
  path.join(root, "node_modules/vitest/vitest.mjs"),
  "run",
  "test/audit-log-rotation.test.ts",
]);
const capabilityPolicyAudit = runStep("capability_policy_audit_tests", [
  process.execPath,
  path.join(root, "node_modules/vitest/vitest.mjs"),
  "run",
  "test/capability-policy-audit.test.ts",
]);
const memoryAtomic = runStep("unified_memory_atomic_persistence_tests", [
  process.execPath,
  path.join(root, "node_modules/vitest/vitest.mjs"),
  "run",
  "test/unified-memory-atomic-persistence.test.ts",
]);

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H9",
  pass:
    horizonStatus.pass
    && tenantIsolation.pass
    && regionFailover.pass
    && auditRotation.pass
    && capabilityPolicyAudit.pass
    && memoryAtomic.pass,
  checks: {
    horizonStatusPass: horizonStatus.pass,
    tenantIsolationPass: tenantIsolation.pass,
    regionFailoverPass: regionFailover.pass,
    auditRotationPass: auditRotation.pass,
    capabilityPolicyAuditPass: capabilityPolicyAudit.pass,
    memoryAtomicPersistencePass: memoryAtomic.pass,
  },
  steps: [
    horizonStatus,
    tenantIsolation,
    regionFailover,
    auditRotation,
    capabilityPolicyAudit,
    memoryAtomic,
  ],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
