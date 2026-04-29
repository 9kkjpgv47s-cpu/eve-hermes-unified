#!/usr/bin/env node
/**
 * Horizon H21 assurance bundle: evidence manifest schema sweep (`validate:manifest-schemas`) plus H20
 * (evidence-gates + H19 chain).
 *
 * Prerequisites: **`validate:all`** and merge-readiness steps so **`evidence/`** holds manifests for schema validation.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H21_ASSURANCE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.H21_ASSURANCE_OUT ?? path.join(evidenceDir, `h21-assurance-bundle-${stamp}.json`);

function runStep(id, argv) {
  const r = spawnSync(argv[0], argv.slice(1), {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  const exitCode = r.status ?? 1;
  return {
    id,
    exitCode,
    pass: exitCode === 0,
    stderr: (r.stderr ?? "").slice(0, 2000),
    stdout: (r.stdout ?? "").slice(0, 8000),
  };
}

function newestMatchingFile(dir, prefix, suffix) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return "";
  }
  const hits = names.filter((n) => n.startsWith(prefix) && n.endsWith(suffix)).sort();
  if (!hits.length) {
    return "";
  }
  return path.join(dir, hits[hits.length - 1]);
}

function readJsonPass(filePath) {
  try {
    const raw = readFileSync(filePath, "utf8");
    const payload = JSON.parse(raw);
    return payload?.pass === true;
  } catch {
    return false;
  }
}

const manifestSchemas = runStep("validate_manifest_schemas", ["npm", "run", "validate:manifest-schemas"]);
const manifestSchemasPass = manifestSchemas.pass;

const h20Bundle = runStep("run_h20_assurance_bundle", [
  process.execPath,
  path.join(root, "scripts/run-h20-assurance-bundle.mjs"),
]);

const h20ReportPath = newestMatchingFile(evidenceDir, "h20-assurance-bundle-", ".json");
const h20PayloadPass = h20ReportPath ? readJsonPass(h20ReportPath) : false;
const h20Pass = h20Bundle.pass && h20PayloadPass;

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H21",
  pass: manifestSchemasPass && h20Pass,
  checks: {
    manifestSchemasPass,
    h20AssuranceBundlePass: h20Pass,
    h20AssuranceBundleReportPass: h20PayloadPass,
  },
  files: {
    h20AssuranceBundlePath: h20ReportPath || null,
  },
  steps: [manifestSchemas, h20Bundle],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
