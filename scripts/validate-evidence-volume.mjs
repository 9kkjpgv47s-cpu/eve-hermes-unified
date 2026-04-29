#!/usr/bin/env node
/**
 * Evidence directory volume guard: total bytes + file count under evidence/ (non-recursive).
 * Emits evidence/evidence-volume-report-<stamp>.json; exit 0 when within budgets.
 */
import { readdir, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const o = { evidenceDir: "", out: "", maxBytes: Number.NaN, maxFiles: Number.NaN };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--evidence-dir") {
      o.evidenceDir = argv[i + 1] ?? "";
      i += 1;
    } else if (a === "--out") {
      o.out = argv[i + 1] ?? "";
      i += 1;
    } else if (a === "--max-bytes") {
      o.maxBytes = Number(argv[i + 1] ?? "NaN");
      i += 1;
    } else if (a === "--max-files") {
      o.maxFiles = Number(argv[i + 1] ?? "NaN");
      i += 1;
    }
  }
  return o;
}

function readEnvInt(name, fallback) {
  const v = Number(process.env[name] ?? "");
  if (Number.isFinite(v) && v > 0) {
    return Math.trunc(v);
  }
  return fallback;
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const evidenceDir = path.resolve(opt.evidenceDir.trim() || path.join(ROOT, "evidence"));
  const maxBytes =
    Number.isFinite(opt.maxBytes) && opt.maxBytes > 0
      ? Math.trunc(opt.maxBytes)
      : readEnvInt("UNIFIED_EVIDENCE_VOLUME_MAX_BYTES", 500_000_000);
  const maxFiles =
    Number.isFinite(opt.maxFiles) && opt.maxFiles > 0
      ? Math.trunc(opt.maxFiles)
      : readEnvInt("UNIFIED_EVIDENCE_VOLUME_MAX_FILES", 5000);

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
  const outPath = opt.out.trim()
    ? path.resolve(opt.out)
    : path.join(evidenceDir, `evidence-volume-report-${stamp}.json`);

  let fileCount = 0;
  let totalBytes = 0;
  const errors = [];

  let entries = [];
  try {
    entries = await readdir(evidenceDir, { withFileTypes: true });
  } catch (e) {
    errors.push(`readdir_failed:${String(e)}`);
  }

  for (const ent of entries) {
    if (!ent.isFile()) {
      continue;
    }
    fileCount += 1;
    const full = path.join(evidenceDir, ent.name);
    try {
      const st = await stat(full);
      totalBytes += st.size;
    } catch (e) {
      errors.push(`${full}:${String(e)}`);
    }
  }

  const withinBytes = totalBytes <= maxBytes;
  const withinFiles = fileCount <= maxFiles;
  const pass = errors.length === 0 && withinBytes && withinFiles;

  const report = {
    schemaVersion: "v1",
    generatedAtIso: new Date().toISOString(),
    evidenceDir,
    pass,
    thresholds: { maxBytes, maxFiles },
    metrics: {
      fileCount,
      totalBytes,
    },
    checks: {
      withinBytes,
      withinFiles,
    },
    errors,
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${outPath}\n`);
  if (!pass) {
    process.exitCode = 2;
  }
}

main().catch((e) => {
  process.stderr.write(`${String(e)}\n`);
  process.exitCode = 2;
});
