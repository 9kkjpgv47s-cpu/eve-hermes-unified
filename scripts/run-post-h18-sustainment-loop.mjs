#!/usr/bin/env node
/**
 * Legacy post-H18 sustainment loop (pre-H19). Prefer **`npm run verify:sustainment-loop`** (post-H19).
 *
 * Post-H18 sustainment loop: horizon metadata, H18 assurance (H17 merge gates + stage-promotion readiness), H18 closeout gate.
 *
 * Run **`npm run run:h16-assurance-bundle`** first when reproducing a full chain locally or after **`npm run validate:all`** when **`evidence/`** lacks goal-policy output through **H18**.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H18_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
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
  process.env.POST_H18_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h18-sustainment-loop-${stamp}.json`);

const horizonStatus = runNpm("validate:horizon-status");
const assurance = runNpm("run:h18-assurance-bundle");
const closeout = runNpm("validate:h18-closeout");

const horizonStatusPass = horizonStatus.exitCode === 0;
const h18AssuranceBundlePass = assurance.exitCode === 0;
const h18CloseoutGatePass = closeout.exitCode === 0;
const pass = horizonStatusPass && h18AssuranceBundlePass && h18CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    horizonStatusPass,
    h18AssuranceBundlePass,
    h18CloseoutGatePass,
  },
  steps: [
    { id: "validate_horizon_status", ...horizonStatus },
    { id: "run_h18_assurance_bundle", ...assurance },
    { id: "validate_h18_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
