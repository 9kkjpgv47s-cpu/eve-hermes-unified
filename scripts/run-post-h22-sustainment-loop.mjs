#!/usr/bin/env node
/**
 * Post-H22 terminal sustainment loop: runs the post-H21 sustainment chain (H17 + H18 + CI soak + entrypoints + shell CI + H21 closeout),
 * then validates **H22** closeout (pins a passing **post-H21** sustainment manifest).
 *
 * Legacy replay without **H22**: **`npm run verify:sustainment-loop:h21-legacy`** (`run-post-h21-sustainment-loop.mjs`).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H22_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
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
  process.env.POST_H22_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h22-sustainment-loop-${stamp}.json`);

const postH21 = runNode("scripts/run-post-h21-sustainment-loop.mjs");
const postH21Pass = postH21.exitCode === 0;

const h22Closeout = runNpm("validate:h22-closeout");
const h22CloseoutGatePass = h22Closeout.exitCode === 0;

const pass = postH21Pass && h22CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    postH21SustainmentLoopPass: postH21Pass,
    h22CloseoutGatePass,
  },
  steps: [
    { id: "run_post_h21_sustainment_loop", ...postH21 },
    { id: "validate_h22_closeout", ...h22Closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
