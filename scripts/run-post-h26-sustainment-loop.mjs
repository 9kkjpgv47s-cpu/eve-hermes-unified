#!/usr/bin/env node
/**
 * Post-H26 terminal sustainment loop: runs the post-H25 sustainment chain (post-H24 inner + emergency rollback + H25 closeout),
 * then records **failure-injection smoke** evidence, then **`validate:h26-closeout`**.
 *
 * Legacy replay without **H26**: **`npm run verify:sustainment-loop:h25-legacy`** (`run-post-h25-sustainment-loop.mjs`).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H26_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
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
  process.env.POST_H26_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h26-sustainment-loop-${stamp}.json`);

const postH25 = runNode("scripts/run-post-h25-sustainment-loop.mjs");
const postH25Pass = postH25.exitCode === 0;

const failureInjection = runNpm("run:failure-injection-evidence");
const failureInjectionEvidencePass = failureInjection.exitCode === 0;

const closeout = runNpm("validate:h26-closeout");
const h26CloseoutGatePass = closeout.exitCode === 0;

const pass = postH25Pass && failureInjectionEvidencePass && h26CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    postH25SustainmentLoopPass: postH25Pass,
    failureInjectionEvidencePass,
    h26CloseoutGatePass,
  },
  steps: [
    { id: "run_post_h25_sustainment_loop", ...postH25 },
    { id: "run_failure_injection_evidence", ...failureInjection },
    { id: "validate_h26_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
