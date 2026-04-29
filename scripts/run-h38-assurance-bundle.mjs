#!/usr/bin/env node
/**
 * Horizon H38 assurance bundle: H37 gates plus evidence manifest schema sweep (fail-closed
 * validation over evidence/ after the H37 terminal slice).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H38_ASSURANCE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.H38_ASSURANCE_OUT ?? path.join(evidenceDir, `h38-assurance-bundle-${stamp}.json`);

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

const h37Bundle = runStep("run_h37_assurance_bundle", [
  process.execPath,
  path.join(root, "scripts/run-h37-assurance-bundle.mjs"),
]);

const manifestSchemas = runStep("validate_manifest_schemas", ["npm", "run", "validate:manifest-schemas"], true);

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H38",
  pass: h37Bundle.pass && manifestSchemas.pass,
  checks: {
    h37AssuranceBundlePass: h37Bundle.pass,
    manifestSchemasPass: manifestSchemas.pass,
  },
  steps: [h37Bundle, manifestSchemas],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
