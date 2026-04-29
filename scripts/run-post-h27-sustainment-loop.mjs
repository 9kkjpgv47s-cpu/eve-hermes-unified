#!/usr/bin/env node
/**
 * Post-H27 terminal sustainment loop: runs the post-H26 sustainment chain (post-H25 inner + failure-injection + H26 closeout),
 * then records **Eve primary regression** evidence, then **`validate:h27-closeout`**.
 *
 * Legacy replay without **H27**: **`npm run verify:sustainment-loop:h26-legacy`** (`run-post-h26-sustainment-loop.mjs`).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H27_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
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
  process.env.POST_H27_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h27-sustainment-loop-${stamp}.json`);

const postH26 = runNode("scripts/run-post-h26-sustainment-loop.mjs");
const postH26Pass = postH26.exitCode === 0;

const regressionEve = runNpm("run:regression-eve-evidence");
const regressionEveEvidencePass = regressionEve.exitCode === 0;

const closeout = runNpm("validate:h27-closeout");
const h27CloseoutGatePass = closeout.exitCode === 0;

const pass = postH26Pass && regressionEveEvidencePass && h27CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    postH26SustainmentLoopPass: postH26Pass,
    regressionEveEvidencePass,
    h27CloseoutGatePass,
  },
  steps: [
    { id: "run_post_h26_sustainment_loop", ...postH26 },
    { id: "run_regression_eve_evidence", ...regressionEve },
    { id: "validate_h27_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
