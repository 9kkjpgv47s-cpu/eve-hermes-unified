import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export default function globalSetup(): void {
  mkdirSync(path.join(repoRoot, "evidence"), { recursive: true });
}
