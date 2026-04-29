#!/usr/bin/env node
/**
 * Post-H26: post-H25 chain + emergency rollback evidence + H26 closeout.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H26_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
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
  process.env.POST_H26_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h26-sustainment-loop-${stamp}.json`);

const postH25 = runNode("scripts/run-post-h25-sustainment-loop.mjs");
const rollback = runNpm("run:emergency-rollback-evidence");
const closeout = runNpm("validate:h26-closeout");

const postH25ChainPass = postH25.exitCode === 0;
const emergencyRollbackEvidencePass = rollback.exitCode === 0;
const h26CloseoutGatePass = closeout.exitCode === 0;
const pass = postH25ChainPass && emergencyRollbackEvidencePass && h26CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    postH25SustainmentChainPass: postH25ChainPass,
    emergencyRollbackEvidencePass,
    h26CloseoutGatePass,
  },
  steps: [
    { id: "run_post_h25_sustainment_loop", ...postH25 },
    { id: "run_emergency_rollback_evidence", ...rollback },
    { id: "validate_h26_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
