#!/usr/bin/env node
/**
 * Post-H29 sustainment: post-H28 chain + post-H28 manifest schema pin + dispatch contract fixtures + H29 closeout.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H29_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
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
  process.env.POST_H29_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h29-sustainment-loop-${stamp}.json`);

const postH28 = runNode("scripts/run-post-h28-sustainment-loop.mjs");
const manifestPostH28 = runNpm("run:manifest-schemas-post-h28-loop-evidence");
const dispatchContract = runNpm("run:dispatch-contract-fixtures-evidence");
const closeout = runNpm("validate:h29-closeout");

const postH28ChainPass = postH28.exitCode === 0;
const manifestSchemasPostH28LoopEvidencePass = manifestPostH28.exitCode === 0;
const dispatchContractFixturesEvidencePass = dispatchContract.exitCode === 0;
const h29CloseoutGatePass = closeout.exitCode === 0;
const pass =
  postH28ChainPass &&
  manifestSchemasPostH28LoopEvidencePass &&
  dispatchContractFixturesEvidencePass &&
  h29CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    postH28SustainmentChainPass: postH28ChainPass,
    manifestSchemasPostH28LoopEvidencePass,
    dispatchContractFixturesEvidencePass,
    h29CloseoutGatePass,
  },
  steps: [
    { id: "run_post_h28_sustainment_loop", ...postH28 },
    { id: "run_manifest_schemas_post_h28_loop_evidence", ...manifestPostH28 },
    { id: "run_dispatch_contract_fixtures_evidence", ...dispatchContract },
    { id: "validate_h29_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
