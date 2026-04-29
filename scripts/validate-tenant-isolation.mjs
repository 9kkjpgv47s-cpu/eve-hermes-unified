#!/usr/bin/env node
/**
 * Runs tenant isolation unit tests and writes an evidence manifest (exit 0 on pass).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.UNIFIED_TENANT_VALIDATION_EVIDENCE_DIR ?? path.join(root, "evidence");
const outFile =
  process.env.UNIFIED_TENANT_VALIDATION_OUT ??
  path.join(evidenceDir, `tenant-isolation-validation-${Date.now()}.json`);

mkdirSync(evidenceDir, { recursive: true });

const vitest = spawnSync(process.execPath, ["./node_modules/vitest/vitest.mjs", "run", "test/tenant-isolation.test.ts"], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });

const payload = {
  recordedAtIso: new Date().toISOString(),
  pass: vitest.status === 0,
  exitCode: vitest.status ?? 1,
  stdout: vitest.stdout?.slice(0, 8000) ?? "",
  stderr: vitest.stderr?.slice(0, 8000) ?? "",
};

writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

if (vitest.status !== 0) {
  process.stderr.write(payload.stderr || "vitest tenant isolation failed\n");
  process.exit(1);
}

process.stdout.write(`${outFile}\n`);
