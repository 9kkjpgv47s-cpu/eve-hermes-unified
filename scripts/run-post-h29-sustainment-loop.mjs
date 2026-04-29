#!/usr/bin/env node
/**
 * Post-H29 terminal sustainment loop: runs the post-H28 sustainment chain (post-H27 inner + evidence-summary + H28 closeout),
 * then records **evidence-gates** aggregation evidence, then **`validate:h29-closeout`**.
 *
 * Legacy replay without **H29**: **`npm run verify:sustainment-loop:h28-legacy`** (`run-post-h28-sustainment-loop.mjs`).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H29_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });

function runNode(scriptRelative, env = process.env) {
  const r = spawnSync(process.execPath, [path.join(root, scriptRelative)], {
    cwd: root,
    encoding: "utf8",
    env,
  });
  return {
    script: scriptRelative,
    exitCode: r.status ?? 1,
    stderr: (r.stderr ?? "").slice(0, 4000),
    stdout: (r.stdout ?? "").slice(0, 4000),
  };
}

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

const postH28 = runNode("scripts/run-post-h28-sustainment-loop.mjs");
const postH28Pass = postH28.exitCode === 0;

const evidenceGates = runNpm("run:evidence-gates-evidence");
const evidenceGatesEvidencePass = evidenceGates.exitCode === 0;

const closeout = runNpm("validate:h29-closeout");
const h29CloseoutGatePass = closeout.exitCode === 0;

const pass = postH28Pass && evidenceGatesEvidencePass && h29CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    postH28SustainmentLoopPass: postH28Pass,
    evidenceGatesEvidencePass,
    h29CloseoutGatePass,
  },
  steps: [
    { id: "run_post_h28_sustainment_loop", ...postH28 },
    { id: "run_evidence_gates_evidence", ...evidenceGates },
    { id: "validate_h29_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
