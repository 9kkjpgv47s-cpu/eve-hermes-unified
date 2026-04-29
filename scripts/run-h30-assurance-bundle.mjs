#!/usr/bin/env node
/**
 * Horizon H30 terminal assurance bundle: **`validate:all`** (full validation chain) then **`run-h29-assurance-bundle`**
 * (release readiness + H28 chain). Folds the standalone **Full validation chain** unified-ci step into terminal assurance.
 *
 * Verifies the newest **`evidence/validation-summary-*.json`** reports **`gates.passed === true`** after **`validate:all`**.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H30_ASSURANCE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.H30_ASSURANCE_OUT ?? path.join(evidenceDir, `h30-assurance-bundle-${stamp}.json`);

const validateAllEnv = {
  ...process.env,
  UNIFIED_ROUTER_DEFAULT_PRIMARY: "hermes",
  UNIFIED_ROUTER_DEFAULT_FALLBACK: "none",
  UNIFIED_ROUTER_FAIL_CLOSED: "1",
  UNIFIED_ROUTER_CUTOVER_STAGE: "full",
  UNIFIED_MEMORY_STORE_KIND: "file",
  UNIFIED_MEMORY_FILE_PATH: "/tmp/eve-hermes-unified-memory.json",
  EVE_TASK_DISPATCH_SCRIPT: "/bin/true",
  EVE_DISPATCH_RESULT_PATH: "/tmp/eve-dispatch.json",
  HERMES_LAUNCH_COMMAND: "/bin/true",
  HERMES_LAUNCH_ARGS: "",
};

function runStep(id, argv, env) {
  const r = spawnSync(argv[0], argv.slice(1), {
    cwd: root,
    encoding: "utf8",
    env: env ?? process.env,
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

function validationSummaryGatePassed(filePath) {
  try {
    const raw = readFileSync(filePath, "utf8");
    const payload = JSON.parse(raw);
    return payload?.gates?.passed === true;
  } catch {
    return false;
  }
}

const validateAll = runStep("validate_all", ["npm", "run", "validate:all"], validateAllEnv);
const validationSummaryPath = newestMatchingFile(evidenceDir, "validation-summary-", ".json");
const validateAllEvidencePass = validationSummaryPath ? validationSummaryGatePassed(validationSummaryPath) : false;
const validateAllGatePass = validateAll.pass && validateAllEvidencePass;

const h29Bundle = runStep("run_h29_assurance_bundle", [
  process.execPath,
  path.join(root, "scripts/run-h29-assurance-bundle.mjs"),
]);

const h29ReportPath = newestMatchingFile(evidenceDir, "h29-assurance-bundle-", ".json");
const h29PayloadPass = h29ReportPath ? readJsonPass(h29ReportPath) : false;
const h29AssuranceBundlePass = h29Bundle.pass && h29PayloadPass;

const pass = validateAllGatePass && h29AssuranceBundlePass;

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H30",
  pass,
  checks: {
    validateAllGatePass,
    validationSummaryEvidencePass: validateAllEvidencePass,
    h29AssuranceBundlePass,
    h29AssuranceBundleReportPass: h29PayloadPass,
  },
  files: {
    validationSummaryPath: validationSummaryPath || null,
    h29AssuranceBundlePath: h29ReportPath || null,
  },
  steps: [validateAll, h29Bundle],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
