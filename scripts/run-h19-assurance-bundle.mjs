#!/usr/bin/env node
/**
 * Horizon H19 assurance bundle: H18 gates plus horizon-status re-validation (fail-closed
 * proof the status file still validates after the full terminal chain).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H19_ASSURANCE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.H19_ASSURANCE_OUT ?? path.join(evidenceDir, `h19-assurance-bundle-${stamp}.json`);

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

const h18Bundle = runStep("run_h18_assurance_bundle", [
  process.execPath,
  path.join(root, "scripts/run-h18-assurance-bundle.mjs"),
]);

const horizonStatusRecheck = runStep("validate_horizon_status", [
  process.execPath,
  path.join(root, "scripts/validate-horizon-status.mjs"),
  "--file",
  path.join(root, "docs/HORIZON_STATUS.json"),
]);

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H19",
  pass: h18Bundle.pass && horizonStatusRecheck.pass,
  checks: {
    h18AssuranceBundlePass: h18Bundle.pass,
    horizonStatusRecheckPass: horizonStatusRecheck.pass,
  },
  steps: [h18Bundle, horizonStatusRecheck],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
