#!/usr/bin/env node
/**
 * Parse soak-*.jsonl (one JSON unified dispatch result per line) and emit soak-metrics-*.json
 * with success/missing-trace/unclassified counts and primary elapsed P95.
 * Optional wall clock: UNIFIED_SOAK_WALL_MS (milliseconds) from soak driver.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyFailureClassKnown, percentile } from "./evidence-gates.mjs";

function parseArgs(argv) {
  let inputPath = "";
  let outPath = "";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === "--in") {
      inputPath = value ?? "";
      i += 1;
    } else if (arg === "--out") {
      outPath = value ?? "";
      i += 1;
    }
  }
  if (!inputPath || !outPath) {
    throw new Error("Usage: node ci-soak-metrics-from-jsonl.mjs --in <soak.jsonl> --out <metrics.json>");
  }
  return { inputPath, outPath };
}

function isDispatchRecord(value) {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    value.response &&
    typeof value.response === "object" &&
    value.envelope
  );
}

/**
 * Extract top-level JSON objects from a buffer (pretty-printed dispatch output
 * is often one object spanning many lines; soak also appends with >>).
 */
export function extractTopLevelJsonObjects(raw) {
  const objects = [];
  let i = 0;
  const len = raw.length;
  while (i < len) {
    while (i < len && /\s/.test(raw[i])) {
      i += 1;
    }
    if (i >= len) {
      break;
    }
    if (raw[i] !== "{") {
      while (i < len && raw[i] !== "\n" && raw[i] !== "\r") {
        i += 1;
      }
      if (raw[i] === "\r") {
        i += 1;
      }
      if (raw[i] === "\n") {
        i += 1;
      }
      continue;
    }
    const start = i;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (; i < len; i += 1) {
      const c = raw[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (inString) {
        if (c === "\\") {
          escape = true;
        } else if (c === '"') {
          inString = false;
        }
        continue;
      }
      if (c === '"') {
        inString = true;
        continue;
      }
      if (c === "{") {
        depth += 1;
      } else if (c === "}") {
        depth -= 1;
        if (depth === 0) {
          objects.push(raw.slice(start, i + 1));
          i += 1;
          break;
        }
      }
    }
    if (depth !== 0) {
      break;
    }
  }
  return objects;
}

export function analyzeSoakJsonlContent(raw) {
  const chunks = extractTopLevelJsonObjects(raw);
  const records = [];
  let parseErrors = 0;
  for (const chunk of chunks) {
    try {
      const parsed = JSON.parse(chunk);
      if (isDispatchRecord(parsed)) {
        records.push(parsed);
      }
    } catch {
      parseErrors += 1;
    }
  }

  const total = records.length;
  let success = 0;
  let missingTrace = 0;
  let unclassifiedFailures = 0;
  const elapsedValues = [];

  for (const record of records) {
    if (record.response?.failureClass === "none") {
      success += 1;
    }
    const traceId = record.response?.traceId ?? record.envelope?.traceId;
    if (!traceId || String(traceId).trim().length === 0) {
      missingTrace += 1;
    }
    const failureClass = record.response?.failureClass;
    if (!classifyFailureClassKnown(failureClass)) {
      unclassifiedFailures += 1;
    }
    const candidates = [record.primaryState?.elapsedMs, record.capabilityExecution?.elapsedMs];
    for (const candidate of candidates) {
      const elapsedMs = Number(candidate);
      if (Number.isFinite(elapsedMs) && elapsedMs >= 0) {
        elapsedValues.push(elapsedMs);
        break;
      }
    }
  }

  const successRate = total > 0 ? success / total : 0;
  const missingTraceRate = total > 0 ? missingTrace / total : 1;
  const p95PrimaryElapsedMs =
    elapsedValues.length === 0 ? null : percentile(elapsedValues, 95);

  const wallRaw = process.env.UNIFIED_SOAK_WALL_MS?.trim();
  const wallClockMs = wallRaw && Number.isFinite(Number(wallRaw)) ? Number(wallRaw) : null;

  return {
    iterations: total,
    parseErrors,
    successCount: success,
    successRate,
    missingTraceCount: missingTrace,
    missingTraceRate,
    unclassifiedFailures,
    p95PrimaryElapsedMs,
    wallClockMs,
    latencySampleCount: elapsedValues.length,
  };
}

async function main() {
  const { inputPath, outPath } = parseArgs(process.argv.slice(2));
  const raw = await readFile(inputPath, "utf8");
  const metrics = analyzeSoakJsonlContent(raw);
  const payload = {
    generatedAtIso: new Date().toISOString(),
    sourceJsonl: path.resolve(inputPath),
    metrics,
  };
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${path.resolve(outPath)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
