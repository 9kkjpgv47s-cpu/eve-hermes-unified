#!/usr/bin/env node
/**
 * Horizon H16 assurance bundle: H15 gates plus goal-policy file validation and evidence manifest schema sweep.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H16_ASSURANCE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.H16_ASSURANCE_OUT ?? path.join(evidenceDir, `h16-assurance-bundle-${stamp}.json`);

const goalPolicyReportPath = path.join(
  evidenceDir,
  process.env.H16_GOAL_POLICY_REPORT_BASENAME ?? "goal-policy-file-validation.json",
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
  };
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

const h15Bundle = runStep("run_h15_assurance_bundle", [
  process.execPath,
  path.join(root, "scripts/run-h15-assurance-bundle.mjs"),
]);

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
  "H26",
  "--require-tagged-requirements",
  "--require-positive-pending-min",
  "--out",
  goalPolicyReportPath,
]);

const goalPolicyPayloadPass = readGoalPolicyPass();
const goalPolicyPass = goalPolicyStep.pass && goalPolicyPayloadPass;

const manifestSchemas = runStep("validate_manifest_schemas", ["npm", "run", "validate:manifest-schemas"]);

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H16",
  pass: h15Bundle.pass && goalPolicyPass && manifestSchemas.pass,
  checks: {
    h15AssuranceBundlePass: h15Bundle.pass,
    goalPolicyFileValidationPass: goalPolicyPass,
    goalPolicyReportPayloadPass: goalPolicyPayloadPass,
    manifestSchemasPass: manifestSchemas.pass,
  },
  steps: [h15Bundle, goalPolicyStep, manifestSchemas],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
