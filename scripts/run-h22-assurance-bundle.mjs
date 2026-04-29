#!/usr/bin/env node
/**
 * Horizon H22 operational assurance sub-chain (post-merge gates): H17 merge-bundle assurance,
 * H18 cutover rehearsal, CI soak SLO drift gate, shell unified-dispatch CI evidence.
 *
 * Unified entrypoints (**`validate:unified-entrypoints`**), tenant isolation (**`validate:tenant-isolation`**),
 * and region failover rehearsal (**`rehearse:region-failover`**) run in **`run-h24-assurance-bundle.mjs`** before **`run-h23-assurance-bundle`**.
 *
 * Prerequisites: **`validate:release-readiness`**, **`validate:initial-scope`**, and **`npm run build`**
 * (via **`validate:all`**) so merge-bundle inputs exist; **`dist/`** exists for shell CI scan where applicable.
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

const h17Bundle = runStep("run_h17_assurance_bundle", [
  process.execPath,
  path.join(root, "scripts/run-h17-assurance-bundle.mjs"),
]);
const h17ReportPath = newestMatchingFile(evidenceDir, "h17-assurance-bundle-", ".json");
const h17PayloadPass = h17ReportPath ? readJsonPass(h17ReportPath) : false;
const h17AssuranceBundlePass = h17Bundle.pass && h17PayloadPass;

const h18Bundle = runStep("run_h18_assurance_bundle", [
  process.execPath,
  path.join(root, "scripts/run-h18-assurance-bundle.mjs"),
]);
const h18ReportPath = newestMatchingFile(evidenceDir, "h18-assurance-bundle-", ".json");
const h18PayloadPass = h18ReportPath ? readJsonPass(h18ReportPath) : false;
const h18AssuranceBundlePass = h18Bundle.pass && h18PayloadPass;

const soakIterations = process.env.UNIFIED_CI_SOAK_ITERATIONS ?? "25";

function runStepWithEnv(id, argv, extraEnv) {
  const r = spawnSync(argv[0], argv.slice(1), {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
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

const ciSoakFixed = runStepWithEnv("run_ci_soak_slo_gate", [process.execPath, path.join(root, "scripts/run-ci-soak-slo-gate.mjs")], {
  UNIFIED_CI_SOAK_ITERATIONS: soakIterations,
});
const ciSoakReportPath = newestMatchingFile(evidenceDir, "ci-soak-slo-gate-", ".json");
const ciSoakPayloadPass = ciSoakReportPath ? readJsonPass(ciSoakReportPath) : false;
const ciSoakSloGatePass = ciSoakFixed.pass && ciSoakPayloadPass;

const shellCi = runStepWithEnv("run_shell_unified_dispatch_ci_evidence", [
  process.execPath,
  path.join(root, "scripts/run-shell-unified-dispatch-ci-evidence.mjs"),
], {});
const shellUnifiedDispatchCiEvidencePass = shellCi.pass;

const pass =
  h17AssuranceBundlePass &&
  h18AssuranceBundlePass &&
  ciSoakSloGatePass &&
  shellUnifiedDispatchCiEvidencePass;

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H22",
  pass,
  checks: {
    h17AssuranceBundlePass,
    h17AssuranceBundleReportPass: h17PayloadPass,
    h18AssuranceBundlePass,
    h18AssuranceBundleReportPass: h18PayloadPass,
    ciSoakSloGatePass,
    ciSoakSloGateReportPass: ciSoakPayloadPass,
    shellUnifiedDispatchCiEvidencePass,
  },
  files: {
    h17AssuranceBundlePath: h17ReportPath || null,
    h18AssuranceBundlePath: h18ReportPath || null,
    ciSoakSloGatePath: ciSoakReportPath || null,
  },
  steps: [h17Bundle, h18Bundle, ciSoakFixed, shellCi],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
