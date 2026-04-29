#!/usr/bin/env node
/**
 * Post-H22 sustainment loop (terminal): horizon metadata, H22 shell CI scan + H21 assurance bundle,
 * CI soak SLO drift gate, H22 closeout gate.
 *
 * Run **`npm run run:h16-assurance-bundle`** first when reproducing locally when **`evidence/`** lacks goal-policy output through **H22**.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H22_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });

function runNpm(script, extraEnv = {}) {
  const r = spawnSync("npm", ["run", script], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
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

const soakIterations = process.env.UNIFIED_CI_SOAK_ITERATIONS ?? "25";

const horizonStatus = runNpm("validate:horizon-status");
const assuranceH22 = runNpm("run:h22-assurance-bundle");
const ciSoakSlo = runNpm("run:ci-soak-slo-gate", { UNIFIED_CI_SOAK_ITERATIONS: soakIterations });
const closeout = runNpm("validate:h22-closeout");

const horizonStatusPass = horizonStatus.exitCode === 0;
const h22AssuranceBundlePass = assuranceH22.exitCode === 0;
const ciSoakSloGatePass = ciSoakSlo.exitCode === 0;
const h22CloseoutGatePass = closeout.exitCode === 0;
const pass =
  horizonStatusPass && h22AssuranceBundlePass && ciSoakSloGatePass && h22CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    horizonStatusPass,
    h22AssuranceBundlePass,
    ciSoakSloGatePass,
    h22CloseoutGatePass,
  },
  steps: [
    { id: "validate_horizon_status", ...horizonStatus },
    { id: "run_h22_assurance_bundle", ...assuranceH22 },
    { id: "run_ci_soak_slo_gate", ...ciSoakSlo },
    { id: "validate_h22_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
