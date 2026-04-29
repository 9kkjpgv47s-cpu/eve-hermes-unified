#!/usr/bin/env node
/**
 * Horizon H12 assurance bundle: H11 gates plus dispatch durability queue replay attempt limit proof.
 *
 * Tenant isolation, region failover, and unified adapter entrypoints run in **`run-h20-assurance-bundle.mjs`** after **`validate:all`** + **`npm run build`**.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H12_ASSURANCE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.H12_ASSURANCE_OUT ?? path.join(evidenceDir, `h12-assurance-bundle-${stamp}.json`);

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
const durabilityRetention = runStep("dispatch_durability_queue_retention_tests", [
  process.execPath,
  path.join(root, "node_modules/vitest/vitest.mjs"),
  "run",
  "test/dispatch-durability-queue-retention.test.ts",
]);
const capPolicyAuditRotation = runStep("capability_policy_audit_rotation_tests", [
  process.execPath,
  path.join(root, "node_modules/vitest/vitest.mjs"),
  "run",
  "test/capability-policy-audit-rotation.test.ts",
]);
const replayLimit = runStep("dispatch_durability_queue_replay_limit_tests", [
  process.execPath,
  path.join(root, "node_modules/vitest/vitest.mjs"),
  "run",
  "test/dispatch-durability-queue-replay-limit.test.ts",
]);

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H12",
  pass:
    horizonStatus.pass
    && auditRotation.pass
    && capabilityPolicyAudit.pass
    && memoryAtomic.pass
    && durabilityRetention.pass
    && capPolicyAuditRotation.pass
    && replayLimit.pass,
  checks: {
    horizonStatusPass: horizonStatus.pass,
    auditRotationPass: auditRotation.pass,
    capabilityPolicyAuditPass: capabilityPolicyAudit.pass,
    memoryAtomicPersistencePass: memoryAtomic.pass,
    dispatchDurabilityQueueRetentionPass: durabilityRetention.pass,
    capabilityPolicyAuditRotationPass: capPolicyAuditRotation.pass,
    dispatchDurabilityQueueReplayLimitPass: replayLimit.pass,
  },
  steps: [
    horizonStatus,
    auditRotation,
    capabilityPolicyAudit,
    memoryAtomic,
    durabilityRetention,
    capPolicyAuditRotation,
    replayLimit,
  ],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
