#!/usr/bin/env node
/**
 * Aggregates H5 exit evidence by running the bounded agent remediation playbook
 * (tenant isolation + region failover + auditable manifest).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H5_CLOSEOUT_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath = process.env.H5_CLOSEOUT_OUT ?? path.join(evidenceDir, `h5-closeout-evidence-${stamp}.json`);

const remediation = spawnSync("bash", [path.join(root, "scripts/agent-remediation-playbook.sh")], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
});

const playbookPathRaw = (remediation.stdout ?? "").trim().split("\n").filter(Boolean).pop() ?? "";
const playbookPath = playbookPathRaw ? path.resolve(root, playbookPathRaw.replace(/^\.\//, "")) : "";

let playbook = null;
try {
  playbook = playbookPath ? JSON.parse(readFileSync(playbookPath, "utf8")) : null;
} catch {
  playbook = null;
}

const tenantStep = playbook?.steps?.find((s) => s.id === "tenant_isolation_validation");
const regionStep = playbook?.steps?.find((s) => s.id === "region_failover_rehearsal");

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H5",
  pass:
    remediation.status === 0
    && playbook?.pass === true
    && tenantStep?.exitCode === 0
    && regionStep?.exitCode === 0,
  boundedPolicy: playbook?.boundedPolicy ?? null,
  playbookManifestPath: playbookPath || null,
  playbook,
  checks: {
    remediationExitPass: remediation.status === 0,
    playbookPass: playbook?.pass === true,
    tenantIsolationExitPass: tenantStep?.exitCode === 0,
    regionFailoverExitPass: regionStep?.exitCode === 0,
  },
  stderr: (remediation.stderr ?? "").slice(0, 4000),
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
