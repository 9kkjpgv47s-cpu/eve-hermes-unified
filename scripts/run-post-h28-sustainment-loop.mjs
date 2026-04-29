#!/usr/bin/env node
/**
 * Post-H28 sustainment loop (terminal): **`run:h28-assurance-bundle`** (initial scope + H27 chain) + **`validate:h28-closeout`**.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H28_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });

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

const assuranceH28 = runNpm("run:h28-assurance-bundle");
const closeout = runNpm("validate:h28-closeout");

const h28AssuranceBundlePass = assuranceH28.exitCode === 0;
const h28CloseoutGatePass = closeout.exitCode === 0;
const pass = h28AssuranceBundlePass && h28CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    h28AssuranceBundlePass,
    h28CloseoutGatePass,
  },
  steps: [
    { id: "run_h28_assurance_bundle", ...assuranceH28 },
    { id: "validate_h28_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
