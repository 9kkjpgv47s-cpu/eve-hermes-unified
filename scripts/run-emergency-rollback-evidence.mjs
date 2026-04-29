#!/usr/bin/env node
/**
 * Records machine-readable evidence for rehearse:emergency-rollback (H3 / H25 closeout).
 * Runs **`npm run rehearse:emergency-rollback`** and writes **`evidence/emergency-rollback-evidence-*.json`**.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.EMERGENCY_ROLLBACK_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });

const rehearsal = spawnSync("npm", ["run", "rehearse:emergency-rollback"], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
  shell: true,
});

const exitCode = rehearsal.status ?? 1;
const pass = exitCode === 0;
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.EMERGENCY_ROLLBACK_EVIDENCE_OUT ??
  path.join(evidenceDir, `emergency-rollback-evidence-${stamp}.json`);

const payload = {
  generatedAtIso: new Date().toISOString(),
  kind: "emergency-rollback-evidence",
  pass,
  checks: {
    emergencyRollbackRehearsalPass: pass,
  },
  steps: [
    {
      id: "rehearse_emergency_rollback",
      exitCode,
      pass,
      stderr: (rehearsal.stderr ?? "").slice(0, 4000),
      stdout: (rehearsal.stdout ?? "").slice(0, 4000),
    },
  ],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(pass ? 0 : 1);
