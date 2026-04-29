#!/usr/bin/env node
/**
 * Post-H23 terminal sustainment loop: runs the post-H22 sustainment chain (H17 + … + tenant isolation + H22 closeout),
 * then records **region failover rehearsal** evidence, then **`validate:h23-closeout`**.
 *
 * Legacy replay without **H23**: **`npm run verify:sustainment-loop:h22-legacy`** (`run-post-h22-sustainment-loop.mjs`).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H23_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
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
  process.env.POST_H23_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h23-sustainment-loop-${stamp}.json`);

const postH22 = runNode("scripts/run-post-h22-sustainment-loop.mjs");
const postH22Pass = postH22.exitCode === 0;

const regionFailover = runNpm("run:region-failover-evidence");
const regionFailoverEvidencePass = regionFailover.exitCode === 0;

const closeout = runNpm("validate:h23-closeout");
const h23CloseoutGatePass = closeout.exitCode === 0;

const pass = postH22Pass && regionFailoverEvidencePass && h23CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    postH22SustainmentLoopPass: postH22Pass,
    regionFailoverEvidencePass,
    h23CloseoutGatePass,
  },
  steps: [
    { id: "run_post_h22_sustainment_loop", ...postH22 },
    { id: "run_region_failover_evidence", ...regionFailover },
    { id: "validate_h23_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
