#!/usr/bin/env node
/**
 * Horizon H14 assurance bundle: H13 gates plus shell unified-dispatch resolver gate (validate-shell-unified-dispatch.sh).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H14_ASSURANCE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.H14_ASSURANCE_OUT ?? path.join(evidenceDir, `h14-assurance-bundle-${stamp}.json`);

function runStep(id, argv) {
  const r = spawnSync(argv[0], argv.slice(1), {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    shell: argv[0] === "bash",
  });
  const exitCode = r.status ?? 1;
  return {
    id,
    exitCode,
    pass: exitCode === 0,
    stderr: (r.stderr ?? "").slice(0, 2000),
  };
}

const h13Bundle = runStep("run_h13_assurance_bundle", [process.execPath, path.join(root, "scripts/run-h13-assurance-bundle.mjs")]);
const shellGate = runStep("validate_shell_unified_dispatch", [
  "bash",
  path.join(root, "scripts/validate-shell-unified-dispatch.sh"),
]);

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H14",
  pass: h13Bundle.pass && shellGate.pass,
  checks: {
    h13AssuranceBundlePass: h13Bundle.pass,
    shellUnifiedDispatchScriptsPass: shellGate.pass,
  },
  steps: [h13Bundle, shellGate],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
