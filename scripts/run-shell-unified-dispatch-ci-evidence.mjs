#!/usr/bin/env node
/**
 * Records machine-readable evidence for validate:shell-unified-dispatch-ci (H15 / H21 closeout).
 * Runs **`npm run validate:shell-unified-dispatch-ci`** and writes **`evidence/shell-unified-dispatch-ci-evidence-*.json`**.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.SHELL_UNIFIED_DISPATCH_CI_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });

const scan = spawnSync("npm", ["run", "validate:shell-unified-dispatch-ci"], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
  shell: true,
});

const exitCode = scan.status ?? 1;
const pass = exitCode === 0;
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.SHELL_UNIFIED_DISPATCH_CI_EVIDENCE_OUT ??
  path.join(evidenceDir, `shell-unified-dispatch-ci-evidence-${stamp}.json`);

const payload = {
  generatedAtIso: new Date().toISOString(),
  kind: "shell-unified-dispatch-ci-evidence",
  pass,
  checks: {
    shellUnifiedDispatchCiScanPass: pass,
  },
  steps: [
    {
      id: "validate_shell_unified_dispatch_ci",
      exitCode,
      pass,
      stderr: (scan.stderr ?? "").slice(0, 4000),
      stdout: (scan.stdout ?? "").slice(0, 4000),
    },
  ],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(pass ? 0 : 1);
