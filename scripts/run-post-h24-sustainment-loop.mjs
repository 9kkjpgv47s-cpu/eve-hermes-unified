#!/usr/bin/env node
/**
 * Post-H24 terminal sustainment loop: runs the post-H23 sustainment chain (post-H22 inner + region failover + H23 closeout),
 * then records **agent remediation rehearsal** evidence, then **`validate:h24-closeout`**.
 *
 * Legacy replay without **H24**: **`npm run verify:sustainment-loop:h23-legacy`** (`run-post-h23-sustainment-loop.mjs`).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H24_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
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
  process.env.POST_H24_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h24-sustainment-loop-${stamp}.json`);

const postH23 = runNode("scripts/run-post-h23-sustainment-loop.mjs");
const postH23Pass = postH23.exitCode === 0;

const agentRemediation = runNpm("run:agent-remediation-evidence");
const agentRemediationEvidencePass = agentRemediation.exitCode === 0;

const closeout = runNpm("validate:h24-closeout");
const h24CloseoutGatePass = closeout.exitCode === 0;

const pass = postH23Pass && agentRemediationEvidencePass && h24CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    postH23SustainmentLoopPass: postH23Pass,
    agentRemediationEvidencePass,
    h24CloseoutGatePass,
  },
  steps: [
    { id: "run_post_h23_sustainment_loop", ...postH23 },
    { id: "run_agent_remediation_evidence", ...agentRemediation },
    { id: "validate_h24_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
