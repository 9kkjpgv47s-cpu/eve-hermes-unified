#!/usr/bin/env node
/**
 * Horizon H28 assurance bundle (non-terminal vs **H29**): **`validate:initial-scope`** then **`run-h27-assurance-bundle`**
 * (horizon status + H26 chain). Folds the standalone **`validate:initial-scope`** unified-ci step into terminal assurance.
 *
 * Prerequisites: **`validate:release-readiness`** has populated **`evidence/release-readiness-*.json`** (or run inside **`run-h29-assurance-bundle`**); **`validate:all`** artifacts under **`evidence/`**.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H28_ASSURANCE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.H28_ASSURANCE_OUT ?? path.join(evidenceDir, `h28-assurance-bundle-${stamp}.json`);

function runStep(id, argv) {
  const r = spawnSync(argv[0], argv.slice(1), {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    shell: argv[0] === "npm",
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

const initialScope = runStep("validate_initial_scope", ["npm", "run", "validate:initial-scope"]);
const initialScopeReportPath = newestMatchingFile(evidenceDir, "initial-scope-validation-", ".json");
const initialScopePayloadPass = initialScopeReportPath ? readJsonPass(initialScopeReportPath) : false;
const initialScopeGatePass = initialScope.pass && initialScopePayloadPass;

const h27Bundle = runStep("run_h27_assurance_bundle", [
  process.execPath,
  path.join(root, "scripts/run-h27-assurance-bundle.mjs"),
]);

const h27ReportPath = newestMatchingFile(evidenceDir, "h27-assurance-bundle-", ".json");
const h27PayloadPass = h27ReportPath ? readJsonPass(h27ReportPath) : false;
const h27AssuranceBundlePass = h27Bundle.pass && h27PayloadPass;

const pass = initialScopeGatePass && h27AssuranceBundlePass;

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H28",
  pass,
  checks: {
    initialScopeGatePass,
    initialScopeReportPass: initialScopePayloadPass,
    h27AssuranceBundlePass,
    h27AssuranceBundleReportPass: h27PayloadPass,
  },
  files: {
    initialScopeReportPath: initialScopeReportPath || null,
    h27AssuranceBundlePath: h27ReportPath || null,
  },
  steps: [initialScope, h27Bundle],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
