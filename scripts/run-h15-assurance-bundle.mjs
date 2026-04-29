#!/usr/bin/env node
/**
 * Horizon H15 assurance bundle: H14 gates plus CI shell unified-dispatch convergence scan (no bypass of unified-dispatch-runner.sh).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H15_ASSURANCE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.H15_ASSURANCE_OUT ?? path.join(evidenceDir, `h15-assurance-bundle-${stamp}.json`);

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

const h14Bundle = runStep("run_h14_assurance_bundle", [process.execPath, path.join(root, "scripts/run-h14-assurance-bundle.mjs")]);
const shellCiScan = runStep("validate_shell_unified_dispatch_ci", [
  process.execPath,
  path.join(root, "scripts/validate-shell-unified-dispatch-ci.mjs"),
]);

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H15",
  pass: h14Bundle.pass && shellCiScan.pass,
  checks: {
    h14AssuranceBundlePass: h14Bundle.pass,
    shellUnifiedDispatchCiScanPass: shellCiScan.pass,
  },
  steps: [h14Bundle, shellCiScan],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
