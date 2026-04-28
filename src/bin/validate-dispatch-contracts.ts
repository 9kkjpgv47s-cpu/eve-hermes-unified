/**
 * Validate unified dispatch JSON files against validateUnifiedDispatchResult.
 *
 * Usage:
 *   tsx src/bin/validate-dispatch-contracts.ts [--file <path>]...
 * With no --file: validates all test/fixtures/unified-dispatch-result-v*.json
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { UnifiedDispatchResult } from "../contracts/types.js";
import { validateUnifiedDispatchResult } from "../contracts/validate.js";

function parseFileArgs(argv: string[]): string[] {
  const files: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--file" && argv[i + 1]) {
      files.push(argv[i + 1]);
      i += 1;
    }
  }
  return files;
}

async function validateFile(filePath: string): Promise<void> {
  const raw = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  validateUnifiedDispatchResult(raw as UnifiedDispatchResult);
}

async function main() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const argv = process.argv.slice(2);
  const explicitFiles = parseFileArgs(argv).map((p) => path.resolve(p));

  let targets: { label: string; path: string }[] = [];

  if (explicitFiles.length > 0) {
    targets = explicitFiles.map((p) => ({ label: path.relative(rootDir, p) || p, path: p }));
  } else {
    const fixtureDir = path.join(rootDir, "test/fixtures");
    const names = (await readdir(fixtureDir)).filter(
      (name) => name.startsWith("unified-dispatch-result-v") && name.endsWith(".json"),
    );
    if (names.length === 0) {
      throw new Error(`No unified-dispatch-result-v*.json fixtures under ${fixtureDir}`);
    }
    targets = names.sort().map((name) => ({
      label: path.join("test/fixtures", name),
      path: path.join(fixtureDir, name),
    }));
  }

  const failures: string[] = [];
  for (const { label, path: filePath } of targets) {
    try {
      await validateFile(filePath);
    } catch (error) {
      failures.push(`${label}: ${String(error)}`);
    }
  }

  if (failures.length > 0) {
    process.stderr.write(`Dispatch contract validation failed:\n- ${failures.join("\n- ")}\n`);
    process.exitCode = 2;
    return;
  }
  process.stdout.write(`OK: validated ${targets.length} dispatch result(s)\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
