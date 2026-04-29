#!/usr/bin/env node
/**
 * Post-H6 operator sustainment loop: validates horizon metadata, regenerates H6 assurance evidence,
 * and runs the H6 closeout gate (requires matching artifacts under evidence/).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H6_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
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
  process.env.POST_H6_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h6-sustainment-loop-${stamp}.json`);

const horizonStatus = runNpm("validate:horizon-status");
const assurance = runNpm("run:h6-assurance-bundle");
const closeout = runNpm("validate:h6-closeout");

const horizonStatusPass = horizonStatus.exitCode === 0;
const h6AssuranceBundlePass = assurance.exitCode === 0;
const h6CloseoutGatePass = closeout.exitCode === 0;
const pass = horizonStatusPass && h6AssuranceBundlePass && h6CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    horizonStatusPass,
    h6AssuranceBundlePass,
    h6CloseoutGatePass,
  },
  steps: [
    { id: "validate_horizon_status", ...horizonStatus },
    { id: "run_h6_assurance_bundle", ...assurance },
    { id: "validate_h6_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
