#!/usr/bin/env node
/**
 * Post-H28 terminal sustainment loop: runs the post-H27 sustainment chain (post-H26 inner + regression-Eve + H27 closeout),
 * then records **evidence-summary** gate evidence, then **`validate:h28-closeout`**.
 *
 * Legacy replay without **H28**: **`npm run verify:sustainment-loop:h27-legacy`** (`run-post-h27-sustainment-loop.mjs`).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H28_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
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
  process.env.POST_H28_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h28-sustainment-loop-${stamp}.json`);

const postH27 = runNode("scripts/run-post-h27-sustainment-loop.mjs");
const postH27Pass = postH27.exitCode === 0;

const evidenceSummary = runNpm("run:evidence-summary-evidence");
const evidenceSummaryEvidencePass = evidenceSummary.exitCode === 0;

const closeout = runNpm("validate:h28-closeout");
const h28CloseoutGatePass = closeout.exitCode === 0;

const pass = postH27Pass && evidenceSummaryEvidencePass && h28CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    postH27SustainmentLoopPass: postH27Pass,
    evidenceSummaryEvidencePass,
    h28CloseoutGatePass,
  },
  steps: [
    { id: "run_post_h27_sustainment_loop", ...postH27 },
    { id: "run_evidence_summary_evidence", ...evidenceSummary },
    { id: "validate_h28_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
