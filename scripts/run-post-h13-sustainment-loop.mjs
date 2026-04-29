#!/usr/bin/env node
/**
 * Post-H13 sustainment loop: horizon metadata, H13 assurance bundle, H13 closeout gate.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H13_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
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
  process.env.POST_H13_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h13-sustainment-loop-${stamp}.json`);

const horizonStatus = runNpm("validate:horizon-status");
const assurance = runNpm("run:h13-assurance-bundle");
const closeout = runNpm("validate:h13-closeout");

const horizonStatusPass = horizonStatus.exitCode === 0;
const h13AssuranceBundlePass = assurance.exitCode === 0;
const h13CloseoutGatePass = closeout.exitCode === 0;
const pass = horizonStatusPass && h13AssuranceBundlePass && h13CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    horizonStatusPass,
    h13AssuranceBundlePass,
    h13CloseoutGatePass,
  },
  steps: [
    { id: "validate_horizon_status", ...horizonStatus },
    { id: "run_h13_assurance_bundle", ...assurance },
    { id: "validate_h13_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
