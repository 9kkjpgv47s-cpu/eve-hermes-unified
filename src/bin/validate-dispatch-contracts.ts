/**
 * Validate all test/fixtures/unified-dispatch-result-v*.json files against
 * validateUnifiedDispatchResult (same rules as runtime).
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { UnifiedDispatchResult } from "../contracts/types.js";
import { validateUnifiedDispatchResult } from "../contracts/validate.js";

async function main() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const fixtureDir = path.join(rootDir, "test/fixtures");
  const names = (await readdir(fixtureDir)).filter(
    (name) => name.startsWith("unified-dispatch-result-v") && name.endsWith(".json"),
  );
  if (names.length === 0) {
    throw new Error(`No unified-dispatch-result-v*.json fixtures under ${fixtureDir}`);
  }
  const failures = [];
  for (const name of names.sort()) {
    const filePath = path.join(fixtureDir, name);
    try {
      const raw = JSON.parse(await readFile(filePath, "utf8")) as unknown;
      validateUnifiedDispatchResult(raw as UnifiedDispatchResult);
    } catch (error) {
      failures.push(`${name}: ${String(error)}`);
    }
  }
  if (failures.length > 0) {
    process.stderr.write(`Dispatch contract fixture validation failed:\n- ${failures.join("\n- ")}\n`);
    process.exitCode = 2;
    return;
  }
  process.stdout.write(`OK: validated ${names.length} fixture(s) under test/fixtures/\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
