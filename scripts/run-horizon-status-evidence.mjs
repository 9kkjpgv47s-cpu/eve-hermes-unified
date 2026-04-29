#!/usr/bin/env node
/**
 * Records machine-readable evidence for validate:horizon-status (H1 / H30 closeout metadata gate).
 * Runs **`validate-horizon-status.mjs`** (same gate as **`npm run validate:horizon-status`**) and writes **`evidence/horizon-status-evidence-*.json`**.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.HORIZON_STATUS_EVIDENCE_DIR ?? path.join(root, "evidence");
const statusFile =
  process.env.HORIZON_STATUS_FILE_FOR_EVIDENCE ?? path.join(root, "docs/HORIZON_STATUS.json");
mkdirSync(evidenceDir, { recursive: true });

const run = spawnSync(
  process.execPath,
  [path.join(root, "scripts/validate-horizon-status.mjs"), "--file", statusFile],
  {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  },
);

const exitCode = run.status ?? 1;
const stdoutParsed = (() => {
  const stdoutTrim = (run.stdout ?? "").trim();
  if (!stdoutTrim) return null;
  try {
    return JSON.parse(stdoutTrim);
  } catch {
    return null;
  }
})();
const reportValid =
  stdoutParsed && typeof stdoutParsed === "object" ? stdoutParsed.valid === true : false;
const pass = exitCode === 0 && reportValid;
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.HORIZON_STATUS_EVIDENCE_OUT ??
  path.join(evidenceDir, `horizon-status-evidence-${stamp}.json`);

const payload = {
  generatedAtIso: new Date().toISOString(),
  kind: "horizon-status-evidence",
  pass,
  checks: {
    horizonStatusValidatorPass: exitCode === 0,
    horizonStatusReportedValid: reportValid,
  },
  steps: [
    {
      id: "validate_horizon_status",
      exitCode,
      pass,
      stderr: (run.stderr ?? "").slice(0, 4000),
      stdout: (run.stdout ?? "").slice(0, 4000),
    },
  ],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(pass ? 0 : 1);
