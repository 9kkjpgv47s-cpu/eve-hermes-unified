#!/usr/bin/env node
/**
 * Post-H20 terminal sustainment loop: runs the post-H19 sustainment chain (H17 + H18 + CI soak + H19 closeout),
 * then validates **H20** closeout (which pins a passing **post-H19** sustainment manifest).
 *
 * Legacy replay without **H20**: **`npm run verify:sustainment-loop:h19-legacy`** (`run-post-h19-sustainment-loop.mjs`).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H20_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
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
  process.env.POST_H20_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h20-sustainment-loop-${stamp}.json`);

const postH19 = runNode("scripts/run-post-h19-sustainment-loop.mjs");
const postH19Pass = postH19.exitCode === 0;

const h20Closeout = runNpm("validate:h20-closeout");
const h20CloseoutGatePass = h20Closeout.exitCode === 0;

const pass = postH19Pass && h20CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    postH19SustainmentLoopPass: postH19Pass,
    h20CloseoutGatePass,
  },
  steps: [
    { id: "run_post_h19_sustainment_loop", ...postH19 },
    { id: "validate_h20_closeout", ...h20Closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
