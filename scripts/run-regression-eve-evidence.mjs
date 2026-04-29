#!/usr/bin/env node
/**
 * Records machine-readable evidence for validate:regression-eve (H1 / H27 closeout routing gate).
 * Runs **`npm run validate:regression-eve`** and writes **`evidence/regression-eve-evidence-*.json`**.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.REGRESSION_EVE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });

const run = spawnSync("npm", ["run", "validate:regression-eve"], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
  shell: true,
});

const exitCode = run.status ?? 1;
const pass = exitCode === 0;
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.REGRESSION_EVE_EVIDENCE_OUT ??
  path.join(evidenceDir, `regression-eve-evidence-${stamp}.json`);

const payload = {
  generatedAtIso: new Date().toISOString(),
  kind: "regression-eve-evidence",
  pass,
  checks: {
    regressionEvePrimaryPass: pass,
  },
  steps: [
    {
      id: "validate_regression_eve",
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
