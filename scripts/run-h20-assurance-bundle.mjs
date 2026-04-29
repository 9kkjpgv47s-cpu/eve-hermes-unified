#!/usr/bin/env node
/**
 * Horizon H20 assurance bundle: H5 tenant isolation + region failover rehearsal, then H18 progressive cutover rehearsal
 * (dry-run H2 drill suite). Consolidates gates previously duplicated in unified-ci (standalone tenant/region + run:h18-assurance-bundle).
 *
 * Prerequisites: same merge-bundle evidence as **`run:h18-assurance-bundle`** (typically **`validate:release-readiness`** + **`validate:initial-scope`** + **`run:h17-assurance-bundle`** outputs under **`evidence/`**).
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H20_ASSURANCE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.H20_ASSURANCE_OUT ?? path.join(evidenceDir, `h20-assurance-bundle-${stamp}.json`);

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

const tenantIsolation = runStep("validate_tenant_isolation", [
  "npm",
  "run",
  "validate:tenant-isolation",
]);
const tenantIsolationPass = tenantIsolation.pass;

const regionFailover = runStep("rehearse_region_failover", [
  "npm",
  "run",
  "rehearse:region-failover",
]);
const regionFailoverPass = regionFailover.pass;

const unifiedEntrypoints = runStep("validate_unified_entrypoints", [
  "npm",
  "run",
  "validate:unified-entrypoints",
]);
const unifiedEntrypointsPass = unifiedEntrypoints.pass;

const h18Bundle = runStep("run_h18_assurance_bundle", [
  process.execPath,
  path.join(root, "scripts/run-h18-assurance-bundle.mjs"),
]);

const h18ReportPath = newestMatchingFile(evidenceDir, "h18-assurance-bundle-", ".json");
const h18PayloadPass = h18ReportPath ? readJsonPass(h18ReportPath) : false;
const h18AssuranceBundlePass = h18Bundle.pass && h18PayloadPass;

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H20",
  pass: tenantIsolationPass && regionFailoverPass && unifiedEntrypointsPass && h18AssuranceBundlePass,
  checks: {
    tenantIsolationPass,
    regionFailoverPass,
    unifiedEntrypointsPass,
    h18AssuranceBundlePass,
    h18AssuranceBundleReportPass: h18PayloadPass,
  },
  files: {
    h18AssuranceBundlePath: h18ReportPath || null,
  },
  steps: [tenantIsolation, regionFailover, unifiedEntrypoints, h18Bundle],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
