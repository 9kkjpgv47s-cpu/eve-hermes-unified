#!/usr/bin/env node
/**
 * Aggregates H5 exit evidence: bounded remediation playbook + H5 evidence baseline
 * (soak SLO, validation summary, prune dry-run).
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

const baselineRun = spawnSync(
  process.execPath,
  [path.join(root, "scripts/h5-evidence-baseline.mjs"), "--evidence-dir", evidenceDir],
  {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  },
);

const baselinePathRaw = (baselineRun.stdout ?? "").trim().split("\n").filter(Boolean).pop() ?? "";
const baselinePath = baselinePathRaw ? path.resolve(baselinePathRaw) : "";

let h5EvidenceBaseline = null;
try {
  h5EvidenceBaseline = baselinePath ? JSON.parse(readFileSync(baselinePath, "utf8")) : null;
} catch {
  h5EvidenceBaseline = null;
}

const h5EvidenceBaselinePass = Boolean(
  baselineRun.status === 0 && h5EvidenceBaseline?.pass === true,
);
const evidencePruneDryRunPass = Boolean(h5EvidenceBaseline?.checks?.evidencePruneDryRunPass === true);

const remediationPass =
  remediation.status === 0
  && playbook?.pass === true
  && tenantStep?.exitCode === 0
  && regionStep?.exitCode === 0;

const pass = remediationPass && h5EvidenceBaselinePass && evidencePruneDryRunPass;

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H5",
  pass,
  boundedPolicy: playbook?.boundedPolicy ?? null,
  playbookManifestPath: playbookPath || null,
  playbook,
  h5EvidenceBaselinePath: baselinePath || null,
  h5EvidenceBaseline,
  checks: {
    remediationExitPass: remediation.status === 0,
    playbookPass: playbook?.pass === true,
    tenantIsolationExitPass: tenantStep?.exitCode === 0,
    regionFailoverExitPass: regionStep?.exitCode === 0,
    h5EvidenceBaselinePass,
    evidencePruneDryRunPass,
  },
  stderr: `${(remediation.stderr ?? "").slice(0, 2000)}\n${(baselineRun.stderr ?? "").slice(0, 2000)}`.trim(),
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
