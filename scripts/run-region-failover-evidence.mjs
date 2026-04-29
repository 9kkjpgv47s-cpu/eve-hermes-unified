#!/usr/bin/env node
/**
 * Records machine-readable evidence for rehearse:region-failover (H24 closeout).
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
const npmPass = exitCode === 0;

const names = readdirSync(evidenceDir)
  .filter((n) => n.startsWith("region-failover-rehearsal-") && n.endsWith(".json"))
  .sort();
const rehearsalPath = names.length ? path.join(evidenceDir, names[names.length - 1]) : null;

let rehearsalPass = false;
if (rehearsalPath) {
  try {
    const raw = readFileSync(rehearsalPath, "utf8");
    const j = JSON.parse(raw);
    rehearsalPass = j?.pass === true && j?.checks?.standbySwapApplied === true;
  } catch {
    rehearsalPass = false;
  }
}

const pass = npmPass && rehearsalPass;
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.REGION_FAILOVER_EVIDENCE_OUT ?? path.join(evidenceDir, `region-failover-evidence-${stamp}.json`);

const payload = {
  generatedAtIso: new Date().toISOString(),
  kind: "region-failover-evidence",
  pass,
  rehearsalManifestPath: rehearsalPath,
  checks: {
    regionFailoverRehearsalPass: npmPass,
    standbySwapEvidencePass: rehearsalPass,
  },
  steps: [
    {
      id: "rehearse_region_failover",
      exitCode,
      pass: npmPass,
      stderr: (scan.stderr ?? "").slice(0, 4000),
      stdout: (scan.stdout ?? "").slice(0, 4000),
    },
  ],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(pass ? 0 : 1);
