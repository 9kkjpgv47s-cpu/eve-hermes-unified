#!/usr/bin/env node
/**
 * Post-H20 sustainment loop: H20 assurance (evidence gates + H19 chain) and H20 closeout gate.
 *
 * Run **`npm run run:h16-assurance-bundle`** first when reproducing a full chain locally or after **`npm run validate:all`** when **`evidence/`** lacks goal-policy output through **H20**.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H20_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
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
  process.env.POST_H20_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h20-sustainment-loop-${stamp}.json`);

const assurance = runNpm("run:h20-assurance-bundle");
const closeout = runNpm("validate:h20-closeout");

const h20AssuranceBundlePass = assurance.exitCode === 0;
const h20CloseoutGatePass = closeout.exitCode === 0;
const pass = h20AssuranceBundlePass && h20CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    h20AssuranceBundlePass,
    h20CloseoutGatePass,
  },
  steps: [
    { id: "run_h20_assurance_bundle", ...assurance },
    { id: "validate_h20_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
