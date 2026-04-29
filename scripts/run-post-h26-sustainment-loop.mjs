#!/usr/bin/env node
/**
 * Post-H26 sustainment loop (terminal): horizon metadata, H26 assurance bundle (H25 chain + stage promotion readiness),
 * H26 closeout gate.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H26_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
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
  process.env.POST_H26_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h26-sustainment-loop-${stamp}.json`);

const horizonStatus = runNpm("validate:horizon-status");
const assuranceH26 = runNpm("run:h26-assurance-bundle");
const closeout = runNpm("validate:h26-closeout");

const horizonStatusPass = horizonStatus.exitCode === 0;
const h26AssuranceBundlePass = assuranceH26.exitCode === 0;
const h26CloseoutGatePass = closeout.exitCode === 0;
const pass = horizonStatusPass && h26AssuranceBundlePass && h26CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    horizonStatusPass,
    h26AssuranceBundlePass,
    h26CloseoutGatePass,
  },
  steps: [
    { id: "validate_horizon_status", ...horizonStatus },
    { id: "run_h26_assurance_bundle", ...assuranceH26 },
    { id: "validate_h26_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
