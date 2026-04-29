#!/usr/bin/env node
/**
 * Post-H27 sustainment loop (terminal): **`run:h27-assurance-bundle`** (horizon status + H26 chain) + **`validate:h27-closeout`**.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H27_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
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
  process.env.POST_H27_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h27-sustainment-loop-${stamp}.json`);

const assuranceH27 = runNpm("run:h27-assurance-bundle");
const closeout = runNpm("validate:h27-closeout");

const h27AssuranceBundlePass = assuranceH27.exitCode === 0;
const h27CloseoutGatePass = closeout.exitCode === 0;
const pass = h27AssuranceBundlePass && h27CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    h27AssuranceBundlePass,
    h27CloseoutGatePass,
  },
  steps: [
    { id: "run_h27_assurance_bundle", ...assuranceH27 },
    { id: "validate_h27_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
