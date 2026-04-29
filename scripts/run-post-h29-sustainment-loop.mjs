#!/usr/bin/env node
/**
 * Post-H29 sustainment loop: same terminal chain as post-H28, plus H29 assurance bundle
 * (post-H28 + manifest schemas) and H29 closeout gate.
 *
 * Run **`npm run run:h16-assurance-bundle`** first when reproducing a full chain locally or after **`npm run validate:all`** when **`evidence/`** lacks goal-policy output through **H29**.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H29_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
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

function runNode(scriptRel) {
  const r = spawnSync(process.execPath, [path.join(root, scriptRel)], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  return {
    script: scriptRel,
    exitCode: r.status ?? 1,
    stderr: (r.stderr ?? "").slice(0, 4000),
    stdout: (r.stdout ?? "").slice(0, 4000),
  };
}

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const manifestPath =
  process.env.POST_H29_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h29-sustainment-loop-${stamp}.json`);

const horizonStatus = runNpm("validate:horizon-status");
const assuranceH17 = runNpm("run:h17-assurance-bundle");
const assuranceH18 = runNpm("run:h18-assurance-bundle");
const ciSoakSlo = runNpm("run:ci-soak-slo-gate");
const entrypoints = runNpm("run:unified-entrypoints-evidence");
const shellCi = runNpm("run:shell-unified-dispatch-ci-evidence");
const tenantIsolation = runNpm("run:tenant-isolation-evidence");
const assuranceH29 = runNode("scripts/run-h29-assurance-bundle.mjs");
const closeout = runNpm("validate:h29-closeout");

const horizonStatusPass = horizonStatus.exitCode === 0;
const h17AssuranceBundlePass = assuranceH17.exitCode === 0;
const h18AssuranceBundlePass = assuranceH18.exitCode === 0;
const ciSoakSloGatePass = ciSoakSlo.exitCode === 0;
const unifiedEntrypointsEvidencePass = entrypoints.exitCode === 0;
const shellUnifiedDispatchCiEvidencePass = shellCi.exitCode === 0;
const tenantIsolationEvidencePass = tenantIsolation.exitCode === 0;
const h29AssuranceBundlePass = assuranceH29.exitCode === 0;
const h29CloseoutGatePass = closeout.exitCode === 0;
const pass =
  horizonStatusPass &&
  h17AssuranceBundlePass &&
  h18AssuranceBundlePass &&
  ciSoakSloGatePass &&
  unifiedEntrypointsEvidencePass &&
  shellUnifiedDispatchCiEvidencePass &&
  tenantIsolationEvidencePass &&
  h29AssuranceBundlePass &&
  h29CloseoutGatePass;

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
    h29AssuranceBundlePass,
    h29CloseoutGatePass,
  },
  steps: [
    { id: "validate_horizon_status", ...horizonStatus },
    { id: "run_h17_assurance_bundle", ...assuranceH17 },
    { id: "run_h18_assurance_bundle", ...assuranceH18 },
    { id: "run_ci_soak_slo_gate", ...ciSoakSlo },
    { id: "run_unified_entrypoints_evidence", ...entrypoints },
    { id: "run_shell_unified_dispatch_ci_evidence", ...shellCi },
    { id: "run_tenant_isolation_evidence", ...tenantIsolation },
    { id: "run_h29_assurance_bundle", ...assuranceH29 },
    { id: "validate_h29_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
