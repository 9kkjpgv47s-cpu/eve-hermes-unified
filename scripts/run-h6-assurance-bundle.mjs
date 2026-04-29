#!/usr/bin/env node
/**
 * Horizon H6 sustainment bundle: reruns critical gates in one evidence artifact
 * (horizon metadata, tenant isolation, region rehearsal).
 *
 * Unified adapter entrypoints (**`validate:unified-entrypoints`**) are enforced in **`run-h22-assurance-bundle.mjs`** after **`validate:all`** + **`npm run build`**.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H6_ASSURANCE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.H6_ASSURANCE_OUT ?? path.join(evidenceDir, `h6-assurance-bundle-${stamp}.json`);

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

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H6",
  pass: horizonStatus.pass && tenantIsolation.pass && regionFailover.pass,
  checks: {
    horizonStatusPass: horizonStatus.pass,
    tenantIsolationPass: tenantIsolation.pass,
    regionFailoverPass: regionFailover.pass,
  },
  steps: [horizonStatus, tenantIsolation, regionFailover],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
