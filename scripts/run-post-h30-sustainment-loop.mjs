#!/usr/bin/env node
/**
 * Post-H30: post-H29 chain + post-H29 manifest pin + H22 closeout + H30 closeout (terminal).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H30_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
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
  process.env.POST_H30_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h30-sustainment-loop-${stamp}.json`);

const postH29 = runNode("scripts/run-post-h29-sustainment-loop.mjs");
const manifestPostH29 = runNpm("run:manifest-schemas-post-h29-loop-evidence");
const h22Closeout = runNpm("validate:h22-closeout");
const h30Closeout = runNpm("validate:h30-closeout");

const postH29ChainPass = postH29.exitCode === 0;
const manifestSchemasPostH29LoopEvidencePass = manifestPostH29.exitCode === 0;
const h22CloseoutGatePass = h22Closeout.exitCode === 0;
const h30CloseoutGatePass = h30Closeout.exitCode === 0;
const pass =
  postH29ChainPass &&
  manifestSchemasPostH29LoopEvidencePass &&
  h22CloseoutGatePass &&
  h30CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    postH29SustainmentChainPass: postH29ChainPass,
    manifestSchemasPostH29LoopEvidencePass,
    h22CloseoutGatePass,
    h30CloseoutGatePass,
  },
  steps: [
    { id: "run_post_h29_sustainment_loop", ...postH29 },
    { id: "run_manifest_schemas_post_h29_loop_evidence", ...manifestPostH29 },
    { id: "validate_h22_closeout", ...h22Closeout },
    { id: "validate_h30_closeout", ...h30Closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
