import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Scripts default to ./evidence; several integration tests invoke promote-horizon
 * without overriding --evidence-dir. The directory is gitignored, so create it once
 * per test run for deterministic local and CI runs.
 */
export default function globalSetup(): void {
  mkdirSync(path.join(repoRoot, "evidence"), { recursive: true });
}
