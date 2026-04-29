#!/usr/bin/env node
/**
 * Post-H22 sustainment core: horizon metadata, H17/H18 bundles, CI soak, entrypoints, shell CI, tenant isolation.
 * Does not run H22 closeout (chained by post-H23 terminal sustainment).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H22_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });

function runNpm(script) {
  const r = spawnSync("npm", ["run", script], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    shell: true,
  });
  return {
    script,
    exitCode: r.status ?? 1,
    stderr: (r.stderr ?? "").slice(0, 4000),
    stdout: (r.stdout ?? "").slice(0, 4000),
  };
}

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const manifestPath =
  process.env.POST_H22_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h22-sustainment-loop-${stamp}.json`);

const horizonStatus = runNpm("validate:horizon-status");
const assuranceH17 = runNpm("run:h17-assurance-bundle");
const assuranceH18 = runNpm("run:h18-assurance-bundle");
const ciSoakSlo = runNpm("run:ci-soak-slo-gate");
const entrypoints = runNpm("run:unified-entrypoints-evidence");
const shellCi = runNpm("run:shell-unified-dispatch-ci-evidence");
const tenantIsolation = runNpm("run:tenant-isolation-evidence");

const horizonStatusPass = horizonStatus.exitCode === 0;
const h17AssuranceBundlePass = assuranceH17.exitCode === 0;
const h18AssuranceBundlePass = assuranceH18.exitCode === 0;
const ciSoakSloGatePass = ciSoakSlo.exitCode === 0;
const unifiedEntrypointsEvidencePass = entrypoints.exitCode === 0;
const shellUnifiedDispatchCiEvidencePass = shellCi.exitCode === 0;
const tenantIsolationEvidencePass = tenantIsolation.exitCode === 0;
const pass =
  horizonStatusPass &&
  h17AssuranceBundlePass &&
  h18AssuranceBundlePass &&
  ciSoakSloGatePass &&
  unifiedEntrypointsEvidencePass &&
  shellUnifiedDispatchCiEvidencePass &&
  tenantIsolationEvidencePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    horizonStatusPass,
    h17AssuranceBundlePass,
    h18AssuranceBundlePass,
    ciSoakSloGatePass,
    unifiedEntrypointsEvidencePass,
    shellUnifiedDispatchCiEvidencePass,
    tenantIsolationEvidencePass,
  },
  steps: [
    { id: "validate_horizon_status", ...horizonStatus },
    { id: "run_h17_assurance_bundle", ...assuranceH17 },
    { id: "run_h18_assurance_bundle", ...assuranceH18 },
    { id: "run_ci_soak_slo_gate", ...ciSoakSlo },
    { id: "run_unified_entrypoints_evidence", ...entrypoints },
    { id: "run_shell_unified_dispatch_ci_evidence", ...shellCi },
    { id: "run_tenant_isolation_evidence", ...tenantIsolation },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
