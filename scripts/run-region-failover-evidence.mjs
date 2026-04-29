#!/usr/bin/env node
/**
 * Records machine-readable evidence for rehearse:region-failover (H5 / H24 closeout).
 * Runs **`npm run rehearse:region-failover`** and writes **`evidence/region-failover-evidence-*.json`**.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.REGION_FAILOVER_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });

const scan = spawnSync("npm", ["run", "rehearse:region-failover"], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
  shell: true,
});

const exitCode = scan.status ?? 1;
const pass = exitCode === 0;
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.REGION_FAILOVER_EVIDENCE_OUT ?? path.join(evidenceDir, `region-failover-evidence-${stamp}.json`);

const names = readdirSync(evidenceDir)
  .filter((n) => n.startsWith("region-failover-rehearsal-") && n.endsWith(".json"))
  .sort();
const rehearsalArtifact = names.length ? path.join(evidenceDir, names[names.length - 1]) : null;

let rehearsalPass = false;
if (rehearsalArtifact) {
  try {
    const raw = readFileSync(rehearsalArtifact, "utf8");
    const j = JSON.parse(raw);
    rehearsalPass = j?.pass === true && j?.checks?.standbySwapApplied === true;
  } catch {
    rehearsalPass = false;
  }
}

const payload = {
  generatedAtIso: new Date().toISOString(),
  kind: "region-failover-evidence",
  pass: pass && rehearsalPass,
  rehearsalManifestPath: rehearsalArtifact,
  checks: {
    regionFailoverRehearsalPass: pass,
    standbySwapEvidencePass: rehearsalPass,
  },
  steps: [
    {
      id: "rehearse_region_failover",
      exitCode,
      pass,
      stderr: (scan.stderr ?? "").slice(0, 4000),
      stdout: (scan.stdout ?? "").slice(0, 4000),
    },
  ],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
