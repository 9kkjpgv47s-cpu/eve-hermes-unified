#!/usr/bin/env node
/**
 * Fail if EveAdapter/HermesAdapter are instantiated outside the canonical unified dispatch binary.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALLOW_FILE = path.join(ROOT, "src/bin/unified-dispatch.ts");

const FORBIDDEN = ["new EveAdapter(", "new HermesAdapter("];

async function collectTsFiles(dir, acc = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectTsFiles(full, acc);
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      acc.push(full);
    }
  }
  return acc;
}

async function scanFile(absPath) {
  const relPath = path.relative(ROOT, absPath).replace(/\\/g, "/");
  if (path.resolve(absPath) === path.resolve(ALLOW_FILE)) {
    return [];
  }
  const raw = await readFile(absPath, "utf8");
  const violations = [];
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) {
      continue;
    }
    for (const needle of FORBIDDEN) {
      if (line.includes(needle)) {
        violations.push({ relPath, line: i + 1, needle });
      }
    }
  }
  return violations;
}

async function main() {
  const srcDir = path.join(ROOT, "src");
  try {
    await stat(srcDir);
  } catch {
    process.stdout.write(`${JSON.stringify({ pass: true, note: "no src/" }, null, 2)}\n`);
    return;
  }

  const files = await collectTsFiles(srcDir);
  /** @type {{ relPath: string; line: number; needle: string }[]} */
  const all = [];
  for (const file of files) {
    all.push(...(await scanFile(file)));
  }

  const report = {
    generatedAtIso: new Date().toISOString(),
    pass: all.length === 0,
    violations: all,
    allowedCanonicalBinary: "src/bin/unified-dispatch.ts",
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.pass) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  process.stderr.write(`${String(err)}\n`);
  process.exitCode = 1;
});
