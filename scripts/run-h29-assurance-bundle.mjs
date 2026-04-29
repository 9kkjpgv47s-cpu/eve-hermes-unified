#!/usr/bin/env node
/**
 * Horizon H29 terminal assurance bundle: **`validate:release-readiness`** (unified-ci env) then **`run-h28-assurance-bundle`**
 * (initial scope + H27 chain). Folds the standalone **Release readiness** unified-ci step into terminal assurance.
 *
 * Prerequisites: **`validate:all`** has populated **`evidence/`** (validation summary and upstream gates release readiness consumes).
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H29_ASSURANCE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.H29_ASSURANCE_OUT ?? path.join(evidenceDir, `h29-assurance-bundle-${stamp}.json`);

const releaseReadinessEnv = {
  ...process.env,
  UNIFIED_RELEASE_READINESS_RUN_VALIDATE_ALL: "0",
  UNIFIED_RELEASE_READINESS_SKIP_TEST: "1",
  UNIFIED_RELEASE_READINESS_EVIDENCE_MIN_SUCCESS_RATE: "0.95",
  UNIFIED_RELEASE_READINESS_EVIDENCE_MAX_P95_LATENCY_MS: "2500",
  UNIFIED_RELEASE_READINESS_EVIDENCE_REQUIRE_FAILURE_SCENARIOS: "1",
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

const releaseReadiness = runStep(
  "validate_release_readiness",
  ["npm", "run", "validate:release-readiness"],
  releaseReadinessEnv,
);
const releaseReadinessReportPath = newestMatchingFile(evidenceDir, "release-readiness-", ".json");
const releaseReadinessPayloadPass = releaseReadinessReportPath ? readJsonPass(releaseReadinessReportPath) : false;
const releaseReadinessGatePass = releaseReadiness.pass && releaseReadinessPayloadPass;

const h28Bundle = runStep("run_h28_assurance_bundle", [
  process.execPath,
  path.join(root, "scripts/run-h28-assurance-bundle.mjs"),
]);

const h28ReportPath = newestMatchingFile(evidenceDir, "h28-assurance-bundle-", ".json");
const h28PayloadPass = h28ReportPath ? readJsonPass(h28ReportPath) : false;
const h28AssuranceBundlePass = h28Bundle.pass && h28PayloadPass;

const pass = releaseReadinessGatePass && h28AssuranceBundlePass;

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H29",
  pass,
  checks: {
    releaseReadinessGatePass,
    releaseReadinessReportPass: releaseReadinessPayloadPass,
    h28AssuranceBundlePass,
    h28AssuranceBundleReportPass: h28PayloadPass,
  },
  files: {
    releaseReadinessReportPath: releaseReadinessReportPath || null,
    h28AssuranceBundlePath: h28ReportPath || null,
  },
  steps: [releaseReadiness, h28Bundle],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
