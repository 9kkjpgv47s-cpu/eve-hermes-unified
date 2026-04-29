#!/usr/bin/env node
/**
 * Horizon H25 terminal assurance bundle: horizon-metadata replay (**`run-h6-assurance-bundle`** + **`run-h16-assurance-bundle`**)
 * then **H24** pre-build gates + policy chain (**`run-h24-assurance-bundle.mjs`**). Consumed by **`run-h26-assurance-bundle.mjs`** (terminal vs **H26**).
 *
 * Prerequisites: **`validate:initial-scope`** has populated merge inputs; **`validate:all`** has run so **H23** and **H22** inner chains can execute inside **H24**.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H25_ASSURANCE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.H25_ASSURANCE_OUT ?? path.join(evidenceDir, `h25-assurance-bundle-${stamp}.json`);

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
    stdout: (r.stdout ?? "").slice(0, 4000),
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

const h6Bundle = runStep("run_h6_assurance_bundle", [
  process.execPath,
  path.join(root, "scripts/run-h6-assurance-bundle.mjs"),
]);
const h6ReportPath = newestMatchingFile(evidenceDir, "h6-assurance-bundle-", ".json");
const h6PayloadPass = h6ReportPath ? readJsonPass(h6ReportPath) : false;
const h6AssuranceBundlePass = h6Bundle.pass && h6PayloadPass;

const h16Bundle = runStep("run_h16_assurance_bundle", [
  process.execPath,
  path.join(root, "scripts/run-h16-assurance-bundle.mjs"),
]);
const h16ReportPath = newestMatchingFile(evidenceDir, "h16-assurance-bundle-", ".json");
const h16PayloadPass = h16ReportPath ? readJsonPass(h16ReportPath) : false;
const h16AssuranceBundlePass = h16Bundle.pass && h16PayloadPass;

const h24Bundle = runStep("run_h24_assurance_bundle", [
  process.execPath,
  path.join(root, "scripts/run-h24-assurance-bundle.mjs"),
]);

const h24ReportPath = newestMatchingFile(evidenceDir, "h24-assurance-bundle-", ".json");
const h24PayloadPass = h24ReportPath ? readJsonPass(h24ReportPath) : false;
const h24AssuranceBundlePass = h24Bundle.pass && h24PayloadPass;

const pass = h6AssuranceBundlePass && h16AssuranceBundlePass && h24AssuranceBundlePass;

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H25",
  pass,
  checks: {
    h6AssuranceBundlePass,
    h6AssuranceBundleReportPass: h6PayloadPass,
    h16AssuranceBundlePass,
    h16AssuranceBundleReportPass: h16PayloadPass,
    h24AssuranceBundlePass,
    h24AssuranceBundleReportPass: h24PayloadPass,
  },
  files: {
    h6AssuranceBundlePath: h6ReportPath || null,
    h16AssuranceBundlePath: h16ReportPath || null,
    h24AssuranceBundlePath: h24ReportPath || null,
  },
  steps: [h6Bundle, h16Bundle, h24Bundle],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
