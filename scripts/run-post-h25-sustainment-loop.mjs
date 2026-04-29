#!/usr/bin/env node
/**
 * Post-H25 terminal sustainment loop: runs the post-H24 sustainment chain (post-H23 inner + agent remediation + H24 closeout),
 * then records **emergency rollback rehearsal** evidence, then **`validate:h25-closeout`**.
 *
 * Legacy replay without **H25**: **`npm run verify:sustainment-loop:h24-legacy`** (`run-post-h24-sustainment-loop.mjs`).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H25_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
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
  process.env.POST_H25_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h25-sustainment-loop-${stamp}.json`);

const postH24 = runNode("scripts/run-post-h24-sustainment-loop.mjs");
const postH24Pass = postH24.exitCode === 0;

const emergencyRollback = runNpm("run:emergency-rollback-evidence");
const emergencyRollbackEvidencePass = emergencyRollback.exitCode === 0;

const closeout = runNpm("validate:h25-closeout");
const h25CloseoutGatePass = closeout.exitCode === 0;

const pass = postH24Pass && emergencyRollbackEvidencePass && h25CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    postH24SustainmentLoopPass: postH24Pass,
    emergencyRollbackEvidencePass,
    h25CloseoutGatePass,
  },
  steps: [
    { id: "run_post_h24_sustainment_loop", ...postH24 },
    { id: "run_emergency_rollback_evidence", ...emergencyRollback },
    { id: "validate_h25_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
