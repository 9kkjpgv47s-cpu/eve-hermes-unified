#!/usr/bin/env node
/**
 * Horizon H24 terminal assurance bundle: pre-build routing gates (**`validate:unified-entrypoints`**,
 * **`validate:tenant-isolation`**, **`rehearse:region-failover`**) then **H23** policy + operational chain (**`run-h23-assurance-bundle.mjs`**).
 *
 * Prerequisites: **`npm run build`** is **not** required for unified-entrypoints / tenant isolation / region rehearsal;
 * **H23** inner chain expects merge inputs under **`evidence/`** after **`validate:all`** (run **H24** after **`validate:initial-scope`** in CI).
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H24_ASSURANCE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.H24_ASSURANCE_OUT ?? path.join(evidenceDir, `h24-assurance-bundle-${stamp}.json`);

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

const unifiedEntrypoints = runStep("validate_unified_entrypoints", [
  process.execPath,
  path.join(root, "scripts/validate-unified-entrypoints.mjs"),
]);
const unifiedEntrypointsScanPass = unifiedEntrypoints.pass;

const tenantIsolation = runStep("validate_tenant_isolation", [
  process.execPath,
  path.join(root, "scripts/validate-tenant-isolation.mjs"),
]);
const tenantIsolationValidationPass = tenantIsolation.pass;

const regionFailover = runStep("rehearse_region_failover", [
  "bash",
  path.join(root, "scripts/region-failover-rehearsal.sh"),
]);
const regionFailoverRehearsalPass = regionFailover.pass;

const h23Bundle = runStep("run_h23_assurance_bundle", [
  process.execPath,
  path.join(root, "scripts/run-h23-assurance-bundle.mjs"),
]);

const h23ReportPath = newestMatchingFile(evidenceDir, "h23-assurance-bundle-", ".json");
const h23PayloadPass = h23ReportPath ? readJsonPass(h23ReportPath) : false;
const h23AssuranceBundlePass = h23Bundle.pass && h23PayloadPass;

const pass =
  unifiedEntrypointsScanPass &&
  tenantIsolationValidationPass &&
  regionFailoverRehearsalPass &&
  h23AssuranceBundlePass;

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H24",
  pass,
  checks: {
    unifiedEntrypointsScanPass,
    tenantIsolationValidationPass,
    regionFailoverRehearsalPass,
    h23AssuranceBundlePass,
    h23AssuranceBundleReportPass: h23PayloadPass,
  },
  files: {
    h23AssuranceBundlePath: h23ReportPath || null,
  },
  steps: [unifiedEntrypoints, tenantIsolation, regionFailover, h23Bundle],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
