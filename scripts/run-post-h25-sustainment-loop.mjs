#!/usr/bin/env node
/**
 * Post-H25 sustainment: post-H24 chain + agent remediation evidence + H25 closeout.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H25_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
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
  process.env.POST_H25_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h25-sustainment-loop-${stamp}.json`);

const postH24 = runNode("scripts/run-post-h24-sustainment-loop.mjs");
const agentRemediation = runNpm("run:agent-remediation-evidence");
const closeout = runNpm("validate:h25-closeout");

const postH24ChainPass = postH24.exitCode === 0;
const agentRemediationEvidencePass = agentRemediation.exitCode === 0;
const h25CloseoutGatePass = closeout.exitCode === 0;
const pass = postH24ChainPass && agentRemediationEvidencePass && h25CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    postH24SustainmentChainPass: postH24ChainPass,
    agentRemediationEvidencePass,
    h25CloseoutGatePass,
  },
  steps: [
    { id: "run_post_h24_sustainment_loop", ...postH24 },
    { id: "run_agent_remediation_evidence", ...agentRemediation },
    { id: "validate_h25_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
