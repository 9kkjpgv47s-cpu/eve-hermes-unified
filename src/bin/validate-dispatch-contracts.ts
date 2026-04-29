#!/usr/bin/env node
/**
 * Validates UnifiedDispatchResult JSON files (fixtures or captured CLI output).
 *
 *   npx tsx src/bin/validate-dispatch-contracts.ts [--file <path>]...
 *
 * With no --file, scans test/fixtures/contracts/unified-dispatch-result-v*.json
 */
import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import type { UnifiedDispatchResult } from "../contracts/types.js";
import { validateUnifiedDispatchResult } from "../contracts/validate.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function parseArgs(argv: string[]): { files: string[] } {
  const files: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--file") {
      const p = argv[i + 1];
      if (p) {
        files.push(path.isAbsolute(p) ? p : path.resolve(process.cwd(), p));
      }
      i += 1;
    }
  }
  return { files };
}

async function defaultFixturePaths(): Promise<string[]> {
  const dir = path.join(rootDir, "test/fixtures/contracts");
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => /^unified-dispatch-result-v.*\.json$/i.test(n))
    .sort()
    .map((n) => path.join(dir, n));
}

function validateFile(filePath: string): void {
  const raw = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as UnifiedDispatchResult;
  validateUnifiedDispatchResult(parsed);
}

async function main() {
  const { files: explicit } = parseArgs(process.argv.slice(2));
  const targets = explicit.length > 0 ? explicit : await defaultFixturePaths();
  if (targets.length === 0) {
    process.stderr.write("validate-dispatch-contracts: no files to validate.\n");
    process.exitCode = 2;
    return;
  }
  for (const file of targets) {
    try {
      validateFile(file);
    } catch (error) {
      process.stderr.write(`validate-dispatch-contracts: failed ${file}: ${String(error)}\n`);
      process.exitCode = 1;
      return;
    }
  }
  process.stdout.write(`OK: validated ${targets.length} dispatch result(s)\n`);
}

void main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
