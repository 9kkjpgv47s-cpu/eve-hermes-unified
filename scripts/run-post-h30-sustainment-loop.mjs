#!/usr/bin/env node
/**
 * Post-H30 sustainment loop (terminal): **`run:h30-assurance-bundle`** (validate:all + H29 chain) + **`validate:h30-closeout`**.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H30_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
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
  process.env.POST_H30_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h30-sustainment-loop-${stamp}.json`);

const assuranceH30 = runNpm("run:h30-assurance-bundle");
const closeout = runNpm("validate:h30-closeout");

const h30AssuranceBundlePass = assuranceH30.exitCode === 0;
const h30CloseoutGatePass = closeout.exitCode === 0;
const pass = h30AssuranceBundlePass && h30CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    h30AssuranceBundlePass,
    h30CloseoutGatePass,
  },
  steps: [
    { id: "run_h30_assurance_bundle", ...assuranceH30 },
    { id: "validate_h30_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
