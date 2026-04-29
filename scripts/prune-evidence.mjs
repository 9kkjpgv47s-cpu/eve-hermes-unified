#!/usr/bin/env node
/**
 * Age-based pruning for timestamped artifacts under evidence/ (H5 retention).
 * Uses file mtime; only deletes basenames matching configured prefixes (never dotfiles).
 */
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_PREFIXES = [
  "soak-",
  "validation-summary-",
  "failure-injection-",
  "cutover-readiness-",
  "regression-eve-primary-",
  "release-readiness-",
  "release-readiness-command-logs-",
  "soak-slo-",
  "soak-slo-baseline-",
  "soak-slo-scheduled-",
  "h4-closeout-evidence-",
  "h5-evidence-baseline-",
  "goal-policy-file-validation-",
  "goal-policy-coverage-",
  "merge-bundle-validation-",
  "bundle-verification-",
  "initial-scope-validation-",
  "emergency-rollback-bundle-",
  "horizon-closeout-",
  "horizon-closeout-run-",
  "h2-closeout-run-",
  "h2-promotion-run-",
  "horizon-promotion-run-",
];

function parseArgs(argv) {
  const o = {
    evidenceDir: "",
    ttlDays: Number.NaN,
    dryRun: false,
    prefixes: "",
    out: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--evidence-dir") {
      o.evidenceDir = argv[i + 1] ?? "";
      i += 1;
    } else if (a === "--ttl-days") {
      o.ttlDays = Number(argv[i + 1] ?? "NaN");
      i += 1;
    } else if (a === "--dry-run") {
      o.dryRun = true;
    } else if (a === "--prefixes") {
      o.prefixes = argv[i + 1] ?? "";
      i += 1;
    } else if (a === "--out") {
      o.out = argv[i + 1] ?? "";
      i += 1;
    }
  }
  return o;
}

function prefixList(raw) {
  if (raw && String(raw).trim()) {
    return String(raw)
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }
  return [...new Set(DEFAULT_PREFIXES.filter((p) => p.length > 0))];
}

function matchesPrefix(name, prefixes) {
  return prefixes.some((p) => name.startsWith(p));
}

async function writeReportJson(report, outOpt, evidenceDir) {
  const json = `${JSON.stringify(report, null, 2)}\n`;
  process.stdout.write(json);
  const outRaw = String(outOpt ?? "").trim();
  const outPath = outRaw
    ? path.resolve(outRaw)
    : path.join(evidenceDir, `evidence-prune-run-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "")}.json`);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, json, "utf8");
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const ttlFromEnv = Number(process.env.UNIFIED_EVIDENCE_PRUNE_TTL_DAYS ?? "");
  let ttlDays = Number.NaN;
  if (Number.isFinite(opt.ttlDays) && opt.ttlDays >= 0) {
    ttlDays = opt.ttlDays;
  } else if (Number.isFinite(ttlFromEnv) && ttlFromEnv >= 0) {
    ttlDays = ttlFromEnv;
  } else {
    ttlDays = 30;
  }
  if (ttlDays === 0) {
    const evidenceDir0 = path.resolve(opt.evidenceDir.trim() || path.join(ROOT, "evidence"));
    const report0 = {
      schemaVersion: "v1",
      generatedAtIso: new Date().toISOString(),
      evidenceDir: evidenceDir0,
      ttlDays: 0,
      dryRun: opt.dryRun,
      pass: true,
      note: "ttl_days=0 disables pruning",
      examined: 0,
      eligible: 0,
      deleted: 0,
      skipped: 0,
      errors: [],
      deletedPaths: [],
    };
    await writeReportJson(report0, opt.out, evidenceDir0);
    return;
  }
  const evidenceDir = path.resolve(opt.evidenceDir.trim() || path.join(ROOT, "evidence"));
  const prefixes = prefixList(opt.prefixes || process.env.UNIFIED_EVIDENCE_PRUNE_PREFIXES || "");
  const now = Date.now();
  const maxAgeMs = ttlDays * 24 * 60 * 60 * 1000;

  const entries = await readdir(evidenceDir, { withFileTypes: true }).catch(() => []);
  const report = {
    schemaVersion: "v1",
    generatedAtIso: new Date().toISOString(),
    evidenceDir,
    ttlDays,
    dryRun: opt.dryRun,
    prefixCount: prefixes.length,
    examined: 0,
    eligible: 0,
    deleted: 0,
    skipped: 0,
    errors: [],
    deletedPaths: [],
  };

  for (const ent of entries) {
    if (!ent.isFile()) {
      continue;
    }
    const name = ent.name;
    if (name.startsWith(".")) {
      report.skipped += 1;
      continue;
    }
    report.examined += 1;
    if (!matchesPrefix(name, prefixes)) {
      report.skipped += 1;
      continue;
    }
    const full = path.join(evidenceDir, name);
    let st;
    try {
      st = await stat(full);
    } catch (e) {
      report.errors.push(`${full}:${String(e)}`);
      continue;
    }
    const ageMs = now - st.mtimeMs;
    if (ageMs <= maxAgeMs) {
      report.skipped += 1;
      continue;
    }
    report.eligible += 1;
    if (opt.dryRun) {
      report.deletedPaths.push(full);
      continue;
    }
    try {
      await unlink(full);
      report.deleted += 1;
      report.deletedPaths.push(full);
    } catch (e) {
      report.errors.push(`${full}:${String(e)}`);
    }
  }

  report.pass = report.errors.length === 0;
  await writeReportJson(report, opt.out, evidenceDir);
  if (report.errors.length > 0) {
    process.exitCode = 2;
  }
}

main().catch((e) => {
  process.stderr.write(`${String(e)}\n`);
  process.exitCode = 2;
});
