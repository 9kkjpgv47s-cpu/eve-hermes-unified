#!/usr/bin/env node
/**
 * Post-H29 sustainment loop (terminal): **`run:h29-assurance-bundle`** (release readiness + H28 chain) + **`validate:h29-closeout`**.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H29_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
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
  process.env.POST_H29_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h29-sustainment-loop-${stamp}.json`);

const assuranceH29 = runNpm("run:h29-assurance-bundle");
const closeout = runNpm("validate:h29-closeout");

const h29AssuranceBundlePass = assuranceH29.exitCode === 0;
const h29CloseoutGatePass = closeout.exitCode === 0;
const pass = h29AssuranceBundlePass && h29CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    h29AssuranceBundlePass,
    h29CloseoutGatePass,
  },
  steps: [
    { id: "run_h29_assurance_bundle", ...assuranceH29 },
    { id: "validate_h29_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
