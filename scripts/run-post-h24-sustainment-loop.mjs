#!/usr/bin/env node
/**
 * Post-H24 sustainment loop (terminal): horizon metadata, H24 assurance bundle (pre-build gates + H23 chain),
 * H24 closeout gate.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H24_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
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
  process.env.POST_H24_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h24-sustainment-loop-${stamp}.json`);

const horizonStatus = runNpm("validate:horizon-status");
const assuranceH24 = runNpm("run:h24-assurance-bundle");
const closeout = runNpm("validate:h24-closeout");

const horizonStatusPass = horizonStatus.exitCode === 0;
const h24AssuranceBundlePass = assuranceH24.exitCode === 0;
const h24CloseoutGatePass = closeout.exitCode === 0;
const pass = horizonStatusPass && h24AssuranceBundlePass && h24CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    horizonStatusPass,
    h24AssuranceBundlePass,
    h24CloseoutGatePass,
  },
  steps: [
    { id: "validate_horizon_status", ...horizonStatus },
    { id: "run_h24_assurance_bundle", ...assuranceH24 },
    { id: "validate_h24_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
