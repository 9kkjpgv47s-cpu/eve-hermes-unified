#!/usr/bin/env node
/**
 * Records machine-readable evidence for validate:tenant-isolation (H5 / H22 closeout).
 * Runs **`npm run validate:tenant-isolation`** (vitest tenant isolation) and writes **`evidence/tenant-isolation-evidence-*.json`**.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.TENANT_ISOLATION_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });

const scan = spawnSync("npm", ["run", "validate:tenant-isolation"], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
  shell: true,
});

const exitCode = scan.status ?? 1;
const pass = exitCode === 0;
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.TENANT_ISOLATION_EVIDENCE_OUT ??
  path.join(evidenceDir, `tenant-isolation-evidence-${stamp}.json`);

const payload = {
  generatedAtIso: new Date().toISOString(),
  kind: "tenant-isolation-evidence",
  pass,
  checks: {
    tenantIsolationValidationPass: pass,
  },
  steps: [
    {
      id: "validate_tenant_isolation",
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
