#!/usr/bin/env node
/**
 * Records machine-readable evidence for rehearse:agent-remediation (H25 closeout).
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.AGENT_REMEDIATION_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });

const run = spawnSync("npm", ["run", "rehearse:agent-remediation"], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
  shell: true,
});
const runExit = run.status ?? 1;

const names = readdirSync(evidenceDir)
  .filter((n) => n.startsWith("agent-remediation-playbook-") && n.endsWith(".json"))
  .sort();
const manifestPath = names.length ? path.join(evidenceDir, names[names.length - 1]) : "";

let boundedDryRunPass = false;
if (manifestPath) {
  try {
    const j = JSON.parse(readFileSync(manifestPath, "utf8"));
    boundedDryRunPass =
      j?.pass === true
      && j?.boundedPolicy?.readOnly === true
      && Array.isArray(j?.boundedPolicy?.mutatingStepsSkipped);
  } catch {
    boundedDryRunPass = false;
  }
}

const pass = runExit === 0 && boundedDryRunPass;
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.AGENT_REMEDIATION_EVIDENCE_OUT ??
  path.join(evidenceDir, `agent-remediation-evidence-${stamp}.json`);

const payload = {
  generatedAtIso: new Date().toISOString(),
  kind: "agent-remediation-evidence",
  pass,
  checks: {
    playbookCliPass: runExit === 0,
    boundedDryRunPolicyPass: boundedDryRunPass,
  },
  manifestPath: manifestPath ? path.relative(root, manifestPath) : "",
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(pass ? 0 : 1);
