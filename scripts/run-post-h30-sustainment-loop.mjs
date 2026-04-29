#!/usr/bin/env node
/**
 * Post-H30 terminal sustainment loop: runs the post-H29 sustainment chain (post-H28 inner + evidence-gates + H29 closeout),
 * then records **horizon-status** metadata gate evidence, then **`validate:h30-closeout`**.
 *
 * Legacy replay without **H30**: **`npm run verify:sustainment-loop:h29-legacy`** (`run-post-h29-sustainment-loop.mjs`).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H30_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
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
  process.env.POST_H30_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h30-sustainment-loop-${stamp}.json`);

const postH29 = runNode("scripts/run-post-h29-sustainment-loop.mjs");
const postH29Pass = postH29.exitCode === 0;

const horizonStatus = runNpm("run:horizon-status-evidence");
const horizonStatusEvidencePass = horizonStatus.exitCode === 0;

const closeout = runNpm("validate:h30-closeout");
const h30CloseoutGatePass = closeout.exitCode === 0;

const pass = postH29Pass && horizonStatusEvidencePass && h30CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    postH29SustainmentLoopPass: postH29Pass,
    horizonStatusEvidencePass,
    h30CloseoutGatePass,
  },
  steps: [
    { id: "run_post_h29_sustainment_loop", ...postH29 },
    { id: "run_horizon_status_evidence", ...horizonStatus },
    { id: "validate_h30_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
