#!/usr/bin/env node
/**
 * Post-H23: post-H22 core + evidence-gates evidence + H23 closeout.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H23_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });

function runNode(scriptRel) {
  const script = path.join(root, scriptRel);
  const r = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8", env: process.env });
  return {
    script: scriptRel,
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
  process.env.POST_H23_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h23-sustainment-loop-${stamp}.json`);

const postH22 = runNode("scripts/run-post-h22-sustainment-loop.mjs");
const evidenceGates = runNpm("run:evidence-gates-evidence");
const closeout = runNpm("validate:h23-closeout");

const postH22ChainPass = postH22.exitCode === 0;
const evidenceGatesEvidencePass = evidenceGates.exitCode === 0;
const h23CloseoutGatePass = closeout.exitCode === 0;
const pass = postH22ChainPass && evidenceGatesEvidencePass && h23CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    postH22SustainmentChainPass: postH22ChainPass,
    evidenceGatesEvidencePass,
    h23CloseoutGatePass,
  },
  steps: [
    { id: "run_post_h22_sustainment_loop", ...postH22 },
    { id: "run_evidence_gates_evidence", ...evidenceGates },
    { id: "validate_h23_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
