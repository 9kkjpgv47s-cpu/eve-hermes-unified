#!/usr/bin/env node
/**
 * Post-H24 sustainment: post-H23 chain + region failover evidence + H24 closeout.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H24_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
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
  process.env.POST_H24_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h24-sustainment-loop-${stamp}.json`);

const postH23 = runNode("scripts/run-post-h23-sustainment-loop.mjs");
const regionFailover = runNpm("run:region-failover-evidence");
const closeout = runNpm("validate:h24-closeout");

const postH23ChainPass = postH23.exitCode === 0;
const regionFailoverEvidencePass = regionFailover.exitCode === 0;
const h24CloseoutGatePass = closeout.exitCode === 0;
const pass = postH23ChainPass && regionFailoverEvidencePass && h24CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    postH23SustainmentChainPass: postH23ChainPass,
    regionFailoverEvidencePass,
    h24CloseoutGatePass,
  },
  steps: [
    { id: "run_post_h23_sustainment_loop", ...postH23 },
    { id: "run_region_failover_evidence", ...regionFailover },
    { id: "validate_h24_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
