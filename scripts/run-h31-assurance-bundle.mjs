#!/usr/bin/env node
/**
 * Horizon H31 assurance bundle: full post-H30 terminal sustainment chain plus an evidence-dir
 * manifest schema sweep (fail-closed proof that sustainment outputs remain schema-valid).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H31_ASSURANCE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.H31_ASSURANCE_OUT ?? path.join(evidenceDir, `h31-assurance-bundle-${stamp}.json`);

function runStep(id, argv, useShell = false) {
  const r = spawnSync(argv[0], argv.slice(1), {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    shell: useShell,
  });
  const exitCode = r.status ?? 1;
  return {
    id,
    exitCode,
    pass: exitCode === 0,
    stderr: (r.stderr ?? "").slice(0, 2000),
  };
}

const postH30 = runStep("run_post_h30_sustainment_loop", [
  process.execPath,
  path.join(root, "scripts/run-post-h30-sustainment-loop.mjs"),
]);

const manifestSchemas = runStep("validate_manifest_schemas", ["npm", "run", "validate:manifest-schemas"], true);

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H31",
  pass: postH30.pass && manifestSchemas.pass,
  checks: {
    postH30SustainmentLoopPass: postH30.pass,
    manifestSchemasPass: manifestSchemas.pass,
  },
  steps: [postH30, manifestSchemas],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
