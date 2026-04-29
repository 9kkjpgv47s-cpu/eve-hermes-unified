#!/usr/bin/env node
/**
 * Records machine-readable evidence for rehearse:agent-remediation (H5 / H25 closeout).
 * Runs **`npm run rehearse:agent-remediation`** and writes **`evidence/agent-remediation-evidence-*.json`**.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.AGENT_REMEDIATION_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });

const scan = spawnSync("npm", ["run", "rehearse:agent-remediation"], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
  shell: true,
});

const exitCode = scan.status ?? 1;
const npmPass = exitCode === 0;
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.AGENT_REMEDIATION_EVIDENCE_OUT ??
  path.join(evidenceDir, `agent-remediation-evidence-${stamp}.json`);

const names = readdirSync(evidenceDir)
  .filter((n) => n.startsWith("agent-remediation-playbook-") && n.endsWith(".json"))
  .sort();
const playbookPath = names.length ? path.join(evidenceDir, names[names.length - 1]) : null;

let playbookPass = false;
if (playbookPath) {
  try {
    const raw = readFileSync(playbookPath, "utf8");
    const j = JSON.parse(raw);
    playbookPass =
      j?.pass === true && j?.boundedPolicy?.readOnly === true && typeof j.boundedPolicy.readOnly === "boolean";
  } catch {
    playbookPass = false;
  }
}

const payload = {
  generatedAtIso: new Date().toISOString(),
  kind: "agent-remediation-evidence",
  pass: npmPass && playbookPass,
  playbookManifestPath: playbookPath,
  checks: {
    agentRemediationRehearsalPass: npmPass,
    agentRemediationPlaybookPass: playbookPass,
  },
  steps: [
    {
      id: "rehearse_agent_remediation",
      exitCode,
      pass: npmPass,
      stderr: (scan.stderr ?? "").slice(0, 4000),
      stdout: (scan.stdout ?? "").slice(0, 4000),
    },
  ],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
