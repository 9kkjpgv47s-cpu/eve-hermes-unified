#!/usr/bin/env node
/**
 * Horizon H35 assurance bundle: H34 gates plus final horizon-status re-validation after the
 * manifest schema sweep (fail-closed proof docs/HORIZON_STATUS.json still validates end-to-end).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H35_ASSURANCE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.H35_ASSURANCE_OUT ?? path.join(evidenceDir, `h35-assurance-bundle-${stamp}.json`);

function runStep(id, argv, useShell = false) {
  const r = spawnSync(argv[0], argv.slice(1), {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    shell: useShell,
  });
  const exitCode = r.status ?? 1;
  return {
    id,
    exitCode,
    pass: exitCode === 0,
    stderr: (r.stderr ?? "").slice(0, 2000),
  };
}

const h34Bundle = runStep("run_h34_assurance_bundle", [
  process.execPath,
  path.join(root, "scripts/run-h34-assurance-bundle.mjs"),
]);

const horizonStatusRecheck = runStep("validate_horizon_status", [
  process.execPath,
  path.join(root, "scripts/validate-horizon-status.mjs"),
  "--file",
  path.join(root, "docs/HORIZON_STATUS.json"),
]);

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H35",
  pass: h34Bundle.pass && horizonStatusRecheck.pass,
  checks: {
    h34AssuranceBundlePass: h34Bundle.pass,
    horizonStatusRecheckPass: horizonStatusRecheck.pass,
  },
  steps: [h34Bundle, horizonStatusRecheck],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
