#!/usr/bin/env node
/**
 * Size-based log rotation for operator scripts (bash, CI).
 * Env (optional): UNIFIED_LOG_ROTATE_MAX_BYTES, UNIFIED_LOG_ROTATE_MAX_FILES (default 8, max 256)
 *
 * Usage:
 *   node scripts/log-rotate.mjs --file <path>
 *   node scripts/log-rotate.mjs --dir <dir> [--glob <pattern>]   (default glob *.log)
 */
import { readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function rotateLogFileIfNeeded(logPath, maxBytes, maxRotatedFiles) {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    return;
  }
  const k =
    Number.isFinite(maxRotatedFiles) && maxRotatedFiles >= 1 ? Math.floor(maxRotatedFiles) : 8;
  const cappedK = Math.min(256, k);
  let size = 0;
  try {
    size = (await stat(logPath)).size;
  } catch {
    return;
  }
  if (size < maxBytes) {
    return;
  }

  const oldest = `${logPath}.${cappedK}`;
  try {
    await unlink(oldest);
  } catch {
    // absent
  }

  for (let i = cappedK - 1; i >= 1; i -= 1) {
    const from = `${logPath}.${i}`;
    const to = `${logPath}.${i + 1}`;
    try {
      await rename(from, to);
    } catch {
      // from may not exist
    }
  }

  try {
    await rename(logPath, `${logPath}.1`);
  } catch {
    return;
  }
  await writeFile(logPath, "", "utf8");
}

function parsePositiveInt(raw, fallback) {
  if (!raw || `${raw}`.trim().length === 0) {
    return fallback;
  }
  const n = Number.parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseArgs(argv) {
  let filePath = "";
  let dirPath = "";
  let glob = "*.log";
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === "--file" && v) {
      filePath = v;
      i += 1;
    } else if (a === "--dir" && v) {
      dirPath = v;
      i += 1;
    } else if (a === "--glob" && v) {
      glob = v;
      i += 1;
    }
  }
  return { filePath, dirPath, glob };
}

function globToMatcher(pattern) {
  if (!pattern.includes("*")) {
    return (name) => name === pattern;
  }
  const [pre, post] = pattern.split("*");
  return (name) => name.startsWith(pre) && name.endsWith(post);
}

async function rotateDir(dirPath, globPattern, maxBytes, maxFiles) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const match = globToMatcher(globPattern);
  for (const ent of entries) {
    if (!ent.isFile()) {
      continue;
    }
    if (!match(ent.name)) {
      continue;
    }
    const full = path.join(dirPath, ent.name);
    await rotateLogFileIfNeeded(full, maxBytes, maxFiles);
  }
}

async function main() {
  const { filePath, dirPath, glob } = parseArgs(process.argv.slice(2));
  const maxBytes = parsePositiveInt(process.env.UNIFIED_LOG_ROTATE_MAX_BYTES, 0);
  const maxFiles = parsePositiveInt(process.env.UNIFIED_LOG_ROTATE_MAX_FILES, 8);

  if (filePath) {
    await rotateLogFileIfNeeded(path.resolve(filePath), maxBytes, maxFiles);
    return;
  }
  if (dirPath) {
    await rotateDir(path.resolve(dirPath), glob, maxBytes, maxFiles);
    return;
  }
  throw new Error("Usage: node log-rotate.mjs --file <path> | node log-rotate.mjs --dir <dir> [--glob <pattern>]");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(`${String(err)}\n`);
    process.exitCode = 1;
  });
}
