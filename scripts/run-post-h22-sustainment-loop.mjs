#!/usr/bin/env node
/**
 * Post-H22 sustainment loop: H22 assurance (unified entrypoints + H21 chain) and H22 closeout gate.
 *
 * Run **`npm run run:h16-assurance-bundle`** first when reproducing a full chain locally or after **`npm run validate:all`** when **`evidence/`** lacks goal-policy output through **H22**.
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

const assurance = runNpm("run:h22-assurance-bundle");
const closeout = runNpm("validate:h22-closeout");

const h22AssuranceBundlePass = assurance.exitCode === 0;
const h22CloseoutGatePass = closeout.exitCode === 0;
const pass = h22AssuranceBundlePass && h22CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    h22AssuranceBundlePass,
    h22CloseoutGatePass,
  },
  steps: [
    { id: "run_h22_assurance_bundle", ...assurance },
    { id: "validate_h22_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
