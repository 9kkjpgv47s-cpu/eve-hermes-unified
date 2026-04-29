#!/usr/bin/env node
/**
 * Records machine-readable evidence for rehearse:emergency-rollback (H26 closeout).
 * Runs **`npm run rehearse:emergency-rollback`** and writes **`evidence/emergency-rollback-evidence-*.json`**.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.EMERGENCY_ROLLBACK_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });

const scan = spawnSync("npm", ["run", "rehearse:emergency-rollback"], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
  shell: true,
});

const exitCode = scan.status ?? 1;
const npmPass = exitCode === 0;

const names = readdirSync(evidenceDir)
  .filter((n) => n.startsWith("emergency-rollback-rehearsal-") && n.endsWith(".json"))
  .sort();
const rehearsalPath = names.length ? path.join(evidenceDir, names[names.length - 1]) : null;

let dryRunPass = false;
if (rehearsalPath) {
  try {
    const raw = readFileSync(rehearsalPath, "utf8");
    const j = JSON.parse(raw);
    const applyStep = Array.isArray(j?.steps)
      ? j.steps.find((s) => s && typeof s === "object" && s.id === "optional-apply")
      : null;
    dryRunPass =
      j?.dryRun === true && applyStep?.status === "skipped" && typeof j?.rollbackScript === "string";
  } catch {
    dryRunPass = false;
  }
}

const pass = npmPass && dryRunPass;
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.EMERGENCY_ROLLBACK_EVIDENCE_OUT ??
  path.join(evidenceDir, `emergency-rollback-evidence-${stamp}.json`);

const payload = {
  generatedAtIso: new Date().toISOString(),
  kind: "emergency-rollback-evidence",
  pass,
  rehearsalManifestPath: rehearsalPath,
  checks: {
    emergencyRollbackRehearsalPass: npmPass,
    emergencyRollbackDryRunEvidencePass: dryRunPass,
  },
  steps: [
    {
      id: "rehearse_emergency_rollback",
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
