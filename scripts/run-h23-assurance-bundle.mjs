#!/usr/bin/env node
/**
 * Horizon H23 terminal assurance bundle: merge readiness policy gates (**`validate:goal-policy-file`** + **`validate:manifest-schemas`**) then **H22** operational chain (**`run-h22-assurance-bundle.mjs`**).
 *
 * Prerequisites: **`npm run build`** (via **`validate:all`**) and merge inputs under **`evidence/`** so **H22** sub-chain can run.
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

const goalPolicyReportPath = path.join(
  evidenceDir,
  process.env.H23_GOAL_POLICY_REPORT_BASENAME ?? "goal-policy-file-validation.json",
);

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

function readGoalPolicyPass() {
  try {
    const raw = readFileSync(goalPolicyReportPath, "utf8");
    const payload = JSON.parse(raw);
    return payload?.pass === true;
  } catch {
    return false;
  }
}

const goalPolicyStep = runStep("validate_goal_policy_file", [
  "npm",
  "run",
  "validate:goal-policy-file",
  "--",
  "--horizon-status-file",
  path.join(root, "docs/HORIZON_STATUS.json"),
  "--goal-policy-file",
  path.join(root, "docs/GOAL_POLICIES.json"),
  "--source-horizon",
  "H2",
  "--until-horizon",
  "H30",
  "--require-tagged-requirements",
  "--require-positive-pending-min",
  "--out",
  goalPolicyReportPath,
]);

const goalPolicyPayloadPass = readGoalPolicyPass();
const goalPolicyPass = goalPolicyStep.pass && goalPolicyPayloadPass;

const manifestSchemas = runStep("validate_manifest_schemas", ["npm", "run", "validate:manifest-schemas"]);

const h22Bundle = runStep("run_h22_assurance_bundle", [
  process.execPath,
  path.join(root, "scripts/run-h22-assurance-bundle.mjs"),
]);

const h22ReportPath = newestMatchingFile(evidenceDir, "h22-assurance-bundle-", ".json");
const h22PayloadPass = h22ReportPath ? readJsonPass(h22ReportPath) : false;
const h22AssuranceBundlePass = h22Bundle.pass && h22PayloadPass;

const pass = goalPolicyPass && manifestSchemas.pass && h22AssuranceBundlePass;

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H23",
  pass,
  checks: {
    goalPolicyFileValidationPass: goalPolicyPass,
    goalPolicyReportPayloadPass: goalPolicyPayloadPass,
    manifestSchemasPass: manifestSchemas.pass,
    h22AssuranceBundlePass,
    h22AssuranceBundleReportPass: h22PayloadPass,
  },
  files: {
    goalPolicyReportPath,
    h22AssuranceBundlePath: h22ReportPath || null,
  },
  steps: [goalPolicyStep, manifestSchemas, h22Bundle],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
