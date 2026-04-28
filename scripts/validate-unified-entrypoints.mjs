#!/usr/bin/env node
/**
 * Ensures EveAdapter / HermesAdapter are only constructed in the unified dispatch binary.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(rootDir, "src");
const allowedFile = path.join(srcDir, "bin", "unified-dispatch.ts");

async function collectTsFiles(dir, acc = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      await collectTsFiles(full, acc);
    } else if (ent.isFile() && ent.name.endsWith(".ts")) {
      acc.push(full);
    }
  }
  return acc;
}

function scan(content, filePath) {
  const violations = [];
  const lines = content.split(/\r?\n/);
  const patterns = [
    { re: /\bnew\s+EveAdapter\s*\(/, kind: "EveAdapter" },
    { re: /\bnew\s+HermesAdapter\s*\(/, kind: "HermesAdapter" },
  ];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const { re, kind } of patterns) {
      if (re.test(line)) {
        violations.push({ file: filePath, line: i + 1, kind, text: line.trim() });
      }
    }
  }
  return violations;
}

const files = await collectTsFiles(srcDir);
const all = [];
for (const file of files) {
  if (path.normalize(file) === path.normalize(allowedFile)) {
    continue;
  }
  const content = await readFile(file, "utf8");
  all.push(...scan(content, path.relative(rootDir, file)));
}

if (all.length > 0) {
  console.error("validate-unified-entrypoints: forbidden adapter instantiation outside unified dispatch binary:\n");
  for (const v of all) {
    console.error(`  ${v.file}:${v.line} ${v.kind}: ${v.text}`);
  }
  process.exit(1);
}

console.log("validate-unified-entrypoints: ok (no stray EveAdapter/HermesAdapter constructors).");
