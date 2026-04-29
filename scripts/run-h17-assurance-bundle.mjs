#!/usr/bin/env node
/**
 * Horizon H17 assurance bundle: H16 gates plus evidence-prune dry-run (TTL retention rehearsal).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H17_ASSURANCE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.H17_ASSURANCE_OUT ?? path.join(evidenceDir, `h17-assurance-bundle-${stamp}.json`);

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

const h16Bundle = runStep("run_h16_assurance_bundle", [
  process.execPath,
  path.join(root, "scripts/run-h16-assurance-bundle.mjs"),
]);

const evidencePruneDryRun = runStep("verify_evidence_prune", ["npm", "run", "verify:evidence-prune"]);

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H17",
  pass: h16Bundle.pass && evidencePruneDryRun.pass,
  checks: {
    h16AssuranceBundlePass: h16Bundle.pass,
    evidencePruneDryRunPass: evidencePruneDryRun.pass,
  },
  steps: [h16Bundle, evidencePruneDryRun],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
