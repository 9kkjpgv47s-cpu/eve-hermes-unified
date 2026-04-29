#!/usr/bin/env node
/**
 * Runs **`evidence-gates.mjs`** against the newest **`validation-summary-*.json`** and **`failure-injection-*`** text
 * under **`evidence/`** (same inputs **`summarize-evidence.mjs`** uses), forwarding any extra CLI args.
 *
 * Override paths with **`UNIFIED_EVIDENCE_SUMMARY_PATH`** / **`UNIFIED_FAILURE_INJECTION_REPORT_PATH`**.
 */
import { readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.UNIFIED_EVIDENCE_DIR ?? path.join(root, "evidence");

function newestMatchingFile(dir, predicate) {
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && predicate(e.name))
    .map((e) => e.name);
  if (names.length === 0) return "";
  names.sort();
  return path.join(dir, names[names.length - 1]);
}

function newestByMtime(dir, predicate) {
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && predicate(e.name))
    .map((e) => e.name);
  if (names.length === 0) return "";
  let best = "";
  let bestMtime = -1;
  for (const name of names) {
    const full = path.join(dir, name);
    try {
      const m = statSync(full).mtimeMs;
      if (m >= bestMtime) {
        bestMtime = m;
        best = full;
      }
    } catch {
      // ignore
    }
  }
  return best;
}

const summaryPath =
  process.env.UNIFIED_EVIDENCE_SUMMARY_PATH?.trim() ||
  newestMatchingFile(evidenceDir, (n) => n.startsWith("validation-summary-") && n.endsWith(".json"));
const failurePath =
  process.env.UNIFIED_FAILURE_INJECTION_REPORT_PATH?.trim() ||
  newestByMtime(evidenceDir, (n) => n.startsWith("failure-injection-"));

if (!summaryPath) {
  process.stderr.write(`invoke-evidence-gates: no validation-summary-*.json under ${evidenceDir}\n`);
  process.exit(1);
}
if (!failurePath) {
  process.stderr.write(`invoke-evidence-gates: no failure-injection-* under ${evidenceDir}\n`);
  process.exit(1);
}

const extra = process.argv.slice(2);
const argv = [
  path.join(root, "scripts/evidence-gates.mjs"),
  "--summary",
  summaryPath,
  "--failure-report",
  failurePath,
  ...extra,
];

const run = spawnSync(process.execPath, argv, {
  cwd: root,
  encoding: "utf8",
  env: process.env,
});

process.stderr.write(run.stderr ?? "");
process.stdout.write(run.stdout ?? "");
process.exit(run.status ?? 1);
