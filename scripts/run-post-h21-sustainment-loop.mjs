#!/usr/bin/env node
/**
 * Post-H21 sustainment loop: H21 assurance (manifest schemas + H20 chain) and H21 closeout gate.
 *
 * Run **`npm run run:h16-assurance-bundle`** first when reproducing a full chain locally or after **`npm run validate:all`** when **`evidence/`** lacks goal-policy output through **H21**.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H21_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
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
  process.env.POST_H21_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h21-sustainment-loop-${stamp}.json`);

const assurance = runNpm("run:h21-assurance-bundle");
const closeout = runNpm("validate:h21-closeout");

const h21AssuranceBundlePass = assurance.exitCode === 0;
const h21CloseoutGatePass = closeout.exitCode === 0;
const pass = h21AssuranceBundlePass && h21CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    h21AssuranceBundlePass,
    h21CloseoutGatePass,
  },
  steps: [
    { id: "run_h21_assurance_bundle", ...assurance },
    { id: "validate_h21_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
