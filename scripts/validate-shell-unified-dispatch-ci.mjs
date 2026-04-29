#!/usr/bin/env node
/**
 * H15 gate: shell scripts under scripts/*.sh must not bypass unified-dispatch-runner.sh
 * with hard-coded node/tsx unified-dispatch invocations (north-star: single ingress for ops scripts).
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptsDir = path.join(root, "scripts");

/** Only unified-dispatch-runner.sh may embed default dist/tsx paths for the CLI binary. */
const EXCLUDE_BASE_NAMES = new Set(["unified-dispatch-runner.sh"]);

function isCommentOrBlank(line) {
  const t = line.trim();
  return t.length === 0 || t.startsWith("#");
}

function scanLine(line, fileLabel, lineNo, violations) {
  if (isCommentOrBlank(line)) {
    return;
  }
  if (line.includes("dist/src/bin/unified-dispatch")) {
    violations.push(`${fileLabel}:${lineNo}: forbidden_substring:dist/src/bin/unified-dispatch`);
  }
  // Direct node/tsx invocation of unified-dispatch entrypoints (use UNIFIED_DISPATCH_CMD after resolve_unified_dispatch).
  if (/\b(node|tsx)\s+[^\n]*unified-dispatch/.test(line)) {
    violations.push(`${fileLabel}:${lineNo}: forbidden_direct_node_tsx_unified_dispatch`);
  }
}

async function collectShFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isFile() && ent.name.endsWith(".sh")) {
      out.push(full);
    }
  }
  return out.sort();
}

const files = await collectShFiles(scriptsDir);
const violations = [];

for (const fullPath of files) {
  const base = path.basename(fullPath);
  if (EXCLUDE_BASE_NAMES.has(base)) {
    continue;
  }
  const rel = path.relative(root, fullPath);
  const raw = await readFile(fullPath, "utf8");
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    scanLine(lines[i], rel, i + 1, violations);
  }
}

if (violations.length > 0) {
  console.error("validate-shell-unified-dispatch-ci: violations:\n");
  for (const v of violations) {
    console.error(`  ${v}`);
  }
  process.exit(1);
}

console.log(`validate-shell-unified-dispatch-ci: ok (${files.length - EXCLUDE_BASE_NAMES.size} scanned shell scripts).`);
