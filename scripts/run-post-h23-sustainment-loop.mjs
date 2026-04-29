#!/usr/bin/env node
/**
 * Post-H23 sustainment loop (terminal): horizon metadata, H23 assurance bundle (goal policy + manifest schemas + H22 operational chain),
 * H23 closeout gate.
 *
 * Legacy post-H22 sustainment (without policy/manifest terminal bundle): **`npm run verify:sustainment-loop:h22-legacy`**.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H23_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
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
  process.env.POST_H23_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h23-sustainment-loop-${stamp}.json`);

const horizonStatus = runNpm("validate:horizon-status");
const assuranceH23 = runNpm("run:h23-assurance-bundle");
const closeout = runNpm("validate:h23-closeout");

const horizonStatusPass = horizonStatus.exitCode === 0;
const h23AssuranceBundlePass = assuranceH23.exitCode === 0;
const h23CloseoutGatePass = closeout.exitCode === 0;
const pass = horizonStatusPass && h23AssuranceBundlePass && h23CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    horizonStatusPass,
    h23AssuranceBundlePass,
    h23CloseoutGatePass,
  },
  steps: [
    { id: "validate_horizon_status", ...horizonStatus },
    { id: "run_h23_assurance_bundle", ...assuranceH23 },
    { id: "validate_h23_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
