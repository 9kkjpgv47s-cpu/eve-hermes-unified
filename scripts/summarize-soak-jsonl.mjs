#!/usr/bin/env node
/**
 * Aggregate soak JSONL output (one JSON object per line) into a single summary manifest (H3).
 * Expects unified-dispatch style payloads with envelope + response.failureClass.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const options = { input: "", out: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input" || arg === "--file") {
      options.input = argv[i + 1] ?? "";
      i += 1;
    } else if (arg === "--out") {
      options.out = argv[i + 1] ?? "";
      i += 1;
    }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(String(options.input || "").trim());
  if (!inputPath) {
    process.stderr.write("Usage: node scripts/summarize-soak-jsonl.mjs --input <soak.jsonl> [--out <summary.json>]\n");
    process.exitCode = 2;
    return;
  }
  const raw = await readFile(inputPath, "utf8");
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  let parsedOk = 0;
  let parseErrors = 0;
  const failureClassCounts = {};
  const laneUsedCounts = {};
  const routingReasonCounts = {};
  for (const line of lines) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      parseErrors += 1;
      continue;
    }
    parsedOk += 1;
    const fc = row?.response?.failureClass;
    if (typeof fc === "string" && fc.length > 0) {
      failureClassCounts[fc] = (failureClassCounts[fc] ?? 0) + 1;
    }
    const lane = row?.response?.laneUsed;
    if (typeof lane === "string" && lane.length > 0) {
      laneUsedCounts[lane] = (laneUsedCounts[lane] ?? 0) + 1;
    }
    const reason = row?.routing?.reason;
    if (typeof reason === "string" && reason.length > 0) {
      routingReasonCounts[reason] = (routingReasonCounts[reason] ?? 0) + 1;
    }
  }
  const missingTrace = lines.filter((line) => {
    try {
      const row = JSON.parse(line);
      return typeof row?.envelope?.traceId !== "string" || !row.envelope.traceId.trim();
    } catch {
      return true;
    }
  }).length;
  const driftAlarms = [];
  if (parseErrors > 0) {
    driftAlarms.push({ code: "soak_parse_errors", count: parseErrors });
  }
  if (missingTrace > 0) {
    driftAlarms.push({ code: "soak_missing_trace_id", count: missingTrace });
  }
  const noneRate =
    parsedOk > 0 ? (failureClassCounts.none ?? 0) / parsedOk : 0;
  if (parsedOk > 0 && noneRate < 0.5) {
    driftAlarms.push({
      code: "soak_low_none_failure_class_rate",
      noneRate,
      threshold: 0.5,
    });
  }
  const pass = driftAlarms.length === 0;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
  const outPath = options.out.trim()
    ? path.resolve(options.out)
    : path.join(path.dirname(inputPath), `soak-summary-${stamp}.json`);
  const payload = {
    schemaVersion: "v1",
    generatedAtIso: new Date().toISOString(),
    pass,
    inputPath,
    lineCount: lines.length,
    parsedOk,
    parseErrors,
    failureClassCounts,
    laneUsedCounts,
    routingReasonCounts,
    driftAlarms,
  };
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (!pass) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
