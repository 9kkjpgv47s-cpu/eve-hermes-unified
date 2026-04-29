#!/usr/bin/env node
/**
 * Post-H16 sustainment loop: horizon metadata, terminal assurance bundle (H18 chains H17→H16),
 * evidence volume. Horizon closeout gates that require this manifest must not nest the
 * same closeout command inside this loop.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H16_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
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
  process.env.POST_H16_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h16-sustainment-loop-${stamp}.json`);

const horizonStatus = runNpm("validate:horizon-status");
const assurance = runNpm("run:h18-assurance-bundle");
const evidenceVolume = runNpm("validate:evidence-volume");

const horizonStatusPass = horizonStatus.exitCode === 0;
const terminalAssuranceBundlePass = assurance.exitCode === 0;
const evidenceVolumePass = evidenceVolume.exitCode === 0;
const pass = horizonStatusPass && terminalAssuranceBundlePass && evidenceVolumePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    horizonStatusPass,
    h16AssuranceBundlePass: terminalAssuranceBundlePass,
    terminalAssuranceBundlePass,
    evidenceVolumePass,
  },
  steps: [
    { id: "validate_horizon_status", ...horizonStatus },
    { id: "run_h18_assurance_bundle", ...assurance },
    { id: "validate_evidence_volume", ...evidenceVolume },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
