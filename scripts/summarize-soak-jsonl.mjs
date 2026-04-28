#!/usr/bin/env node
/**
 * H3: aggregate soak JSONL for drift signals (failure classes, lanes, routing reasons).
 */
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const opts = { evidenceDir: "", out: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--evidence-dir") {
      opts.evidenceDir = argv[i + 1] ?? "";
      i += 1;
    } else if (a === "--out") {
      opts.out = argv[i + 1] ?? "";
      i += 1;
    }
  }
  return opts;
}

async function newestSoakJsonl(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = entries
    .filter(
      (e) =>
        e.isFile() &&
        e.name.startsWith("soak-") &&
        e.name.endsWith(".jsonl") &&
        !e.name.startsWith("soak-summary"),
    )
    .map((e) => path.join(dir, e.name));
  if (files.length === 0) {
    return null;
  }
  files.sort();
  return files[files.length - 1];
}

function isDispatchRecord(o) {
  return Boolean(o && typeof o === "object" && o.response && o.envelope);
}

function parseRecords(raw) {
  const records = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith("{")) {
      continue;
    }
    try {
      const o = JSON.parse(t);
      if (isDispatchRecord(o)) {
        records.push(o);
      }
    } catch {
      // skip
    }
  }
  return records;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const dir = opts.evidenceDir || path.join(process.cwd(), "evidence");
  const soakFile = await newestSoakJsonl(dir);
  if (!soakFile) {
    throw new Error(`No soak-*.jsonl under ${dir}`);
  }
  const raw = await readFile(soakFile, "utf8");
  const records = parseRecords(raw);
  const failureClasses = {};
  const lanes = {};
  const routingReasons = {};
  let parseErrors = 0;
  let missingTrace = 0;
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("{")) {
      continue;
    }
    if (t.includes("error") || t.includes("Error")) {
      parseErrors += 1;
    }
  }
  for (const r of records) {
    const fc = r.response?.failureClass ?? "unknown";
    failureClasses[fc] = (failureClasses[fc] ?? 0) + 1;
    const lane = r.response?.laneUsed ?? "unknown";
    lanes[lane] = (lanes[lane] ?? 0) + 1;
    const reason = r.routing?.reason ?? "unknown";
    routingReasons[reason] = (routingReasons[reason] ?? 0) + 1;
    const tid = r.response?.traceId ?? r.envelope?.traceId;
    if (!tid || String(tid).trim() === "") {
      missingTrace += 1;
    }
  }
  const total = records.length;
  const noneRate = total > 0 ? (failureClasses.none ?? 0) / total : 0;
  const driftAlarms = [];
  if (parseErrors > 0) {
    driftAlarms.push("soak_parse_errors");
  }
  if (missingTrace > 0) {
    driftAlarms.push("soak_missing_trace");
  }
  if (total > 10 && noneRate < 0.5) {
    driftAlarms.push("soak_low_none_failure_class_rate");
  }
  const summary = {
    generatedAtIso: new Date().toISOString(),
    soakFile,
    totalRecords: total,
    failureClasses,
    lanes,
    routingReasons,
    driftAlarms,
  };
  const out =
    opts.out ||
    path.join(dir, `soak-summary-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

main().catch((e) => {
  process.stderr.write(`${String(e?.message ?? e)}\n`);
  process.exitCode = 1;
});
