#!/usr/bin/env node
/**
 * Records machine-readable evidence for validate:unified-entrypoints (H4 / H20 closeout).
 * Runs **`npm run validate:unified-entrypoints`** and writes **`evidence/unified-entrypoints-evidence-*.json`**.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.UNIFIED_ENTRYPOINTS_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });

const scan = spawnSync("npm", ["run", "validate:unified-entrypoints"], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
  shell: true,
});

const exitCode = scan.status ?? 1;
const pass = exitCode === 0;
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.UNIFIED_ENTRYPOINTS_EVIDENCE_OUT ??
  path.join(evidenceDir, `unified-entrypoints-evidence-${stamp}.json`);

const payload = {
  generatedAtIso: new Date().toISOString(),
  kind: "unified-entrypoints-evidence",
  pass,
  checks: {
    unifiedEntrypointsScanPass: pass,
  },
  steps: [
    {
      id: "validate_unified_entrypoints",
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
