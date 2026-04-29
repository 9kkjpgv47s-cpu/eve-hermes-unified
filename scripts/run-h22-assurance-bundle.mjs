#!/usr/bin/env node
/**
 * Horizon H22 assurance bundle: unified adapter entrypoint gate (`validate:unified-entrypoints`) plus H21
 * (manifest schemas + H20 chain).
 *
 * Prerequisites: **`npm run build`** (via **`validate:all`**) so **`src/`** TypeScript is present for the scan.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H22_ASSURANCE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.H22_ASSURANCE_OUT ?? path.join(evidenceDir, `h22-assurance-bundle-${stamp}.json`);

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

const unifiedEntrypoints = runStep("validate_unified_entrypoints", [
  "npm",
  "run",
  "validate:unified-entrypoints",
]);
const unifiedEntrypointsPass = unifiedEntrypoints.pass;

const h21Bundle = runStep("run_h21_assurance_bundle", [
  process.execPath,
  path.join(root, "scripts/run-h21-assurance-bundle.mjs"),
]);

const h21ReportPath = newestMatchingFile(evidenceDir, "h21-assurance-bundle-", ".json");
const h21PayloadPass = h21ReportPath ? readJsonPass(h21ReportPath) : false;
const h21Pass = h21Bundle.pass && h21PayloadPass;

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H22",
  pass: unifiedEntrypointsPass && h21Pass,
  checks: {
    unifiedEntrypointsPass,
    h21AssuranceBundlePass: h21Pass,
    h21AssuranceBundleReportPass: h21PayloadPass,
  },
  files: {
    h21AssuranceBundlePath: h21ReportPath || null,
  },
  steps: [unifiedEntrypoints, h21Bundle],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
