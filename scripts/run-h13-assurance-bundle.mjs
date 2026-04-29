#!/usr/bin/env node
/**
 * Horizon H13 assurance bundle: H12 gates plus CI soak SLO drift gate (summarize-soak-report with fail-on-drift).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H13_ASSURANCE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.H13_ASSURANCE_OUT ?? path.join(evidenceDir, `h13-assurance-bundle-${stamp}.json`);

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

const h12Bundle = runStep("run_h12_assurance_bundle", [process.execPath, path.join(root, "scripts/run-h12-assurance-bundle.mjs")]);
const ciSoakSlo = runStep("ci_soak_slo_gate", [process.execPath, path.join(root, "scripts/run-ci-soak-slo-gate.mjs")]);

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H13",
  pass: h12Bundle.pass && ciSoakSlo.pass,
  checks: {
    h12AssuranceBundlePass: h12Bundle.pass,
    ciSoakSloDriftGatePass: ciSoakSlo.pass,
  },
  steps: [h12Bundle, ciSoakSlo],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
