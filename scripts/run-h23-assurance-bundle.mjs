#!/usr/bin/env node
/**
 * Horizon H23 assurance bundle: shell unified-dispatch CI convergence scan (`validate:shell-unified-dispatch-ci`)
 * plus H22 (unified entrypoints + H21 chain).
 *
 * Prerequisites: **`npm run build`** (via **`validate:all`**) so shell scripts can legitimately reference **`dist/`** unified-dispatch outputs where applicable.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H23_ASSURANCE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.H23_ASSURANCE_OUT ?? path.join(evidenceDir, `h23-assurance-bundle-${stamp}.json`);

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

const shellCiScan = runStep("validate_shell_unified_dispatch_ci", [
  "npm",
  "run",
  "validate:shell-unified-dispatch-ci",
]);
const shellUnifiedDispatchCiScanPass = shellCiScan.pass;

const h22Bundle = runStep("run_h22_assurance_bundle", [
  process.execPath,
  path.join(root, "scripts/run-h22-assurance-bundle.mjs"),
]);

const h22ReportPath = newestMatchingFile(evidenceDir, "h22-assurance-bundle-", ".json");
const h22PayloadPass = h22ReportPath ? readJsonPass(h22ReportPath) : false;
const h22Pass = h22Bundle.pass && h22PayloadPass;

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H23",
  pass: shellUnifiedDispatchCiScanPass && h22Pass,
  checks: {
    shellUnifiedDispatchCiScanPass,
    h22AssuranceBundlePass: h22Pass,
    h22AssuranceBundleReportPass: h22PayloadPass,
  },
  files: {
    h22AssuranceBundlePath: h22ReportPath || null,
  },
  steps: [shellCiScan, h22Bundle],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
