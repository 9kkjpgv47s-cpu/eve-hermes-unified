#!/usr/bin/env node
/**
 * Records machine-readable evidence for rehearse:emergency-rollback (H26 closeout).
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.EMERGENCY_ROLLBACK_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });

const run = spawnSync("npm", ["run", "rehearse:emergency-rollback"], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
  shell: true,
});
const runExit = run.status ?? 1;

const names = readdirSync(evidenceDir)
  .filter((n) => n.startsWith("emergency-rollback-rehearsal-") && n.endsWith(".json"))
  .sort();
const manifestPath = names.length ? path.join(evidenceDir, names[names.length - 1]) : "";

let dryRunPass = false;
if (manifestPath) {
  try {
    const j = JSON.parse(readFileSync(manifestPath, "utf8"));
    const applyStep = j?.steps?.find?.((s) => s?.id === "optional-apply");
    dryRunPass = j?.dryRun === true && applyStep?.status === "skipped";
  } catch {
    dryRunPass = false;
  }
}

const pass = runExit === 0 && dryRunPass;
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.EMERGENCY_ROLLBACK_EVIDENCE_OUT ??
  path.join(evidenceDir, `emergency-rollback-evidence-${stamp}.json`);

const payload = {
  generatedAtIso: new Date().toISOString(),
  kind: "emergency-rollback-evidence",
  pass,
  checks: {
    rehearsalCliPass: runExit === 0,
    emergencyRollbackDryRunEvidencePass: dryRunPass,
  },
  manifestPath: manifestPath ? path.relative(root, manifestPath) : "",
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(pass ? 0 : 1);
