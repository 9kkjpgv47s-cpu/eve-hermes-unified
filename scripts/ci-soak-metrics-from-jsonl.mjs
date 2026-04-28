#!/usr/bin/env node
/**
 * Parse soak logs (pretty-printed dispatch JSON objects) and emit soak-metrics JSON
 * with success/missing-trace/unclassified, P95 primary elapsed, failure-class counts/rates.
 * Optional wall clock: UNIFIED_SOAK_WALL_MS (milliseconds) from soak driver.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyFailureClassKnown, percentile } from "./evidence-gates.mjs";
import { extractDispatchJsonRecords } from "./dispatch-json-extract.mjs";

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

function bump(map, key) {
  const k = key === undefined || key === null ? "undefined" : String(key);
  map[k] = (map[k] ?? 0) + 1;
}

export function analyzeSoakDispatchRecords(records) {
  const total = records.length;
  let success = 0;
  let missingTrace = 0;
  let unclassifiedFailures = 0;
  const elapsedValues = [];
  const failureClassCounts = {};

  for (const record of records) {
    const fc = record?.response?.failureClass;
    bump(failureClassCounts, fc);
    if (fc === "none") {
      success += 1;
    }
    const traceId = record?.response?.traceId ?? record?.envelope?.traceId;
    if (!traceId || String(traceId).trim().length === 0) {
      missingTrace += 1;
    }
    if (!classifyFailureClassKnown(fc)) {
      unclassifiedFailures += 1;
    }
    const candidates = [record?.primaryState?.elapsedMs, record?.capabilityExecution?.elapsedMs];
    for (const candidate of candidates) {
      const elapsedMs = Number(candidate);
      if (Number.isFinite(elapsedMs) && elapsedMs >= 0) {
        elapsedValues.push(elapsedMs);
        break;
      }
    }
  }

  const rate = (n) => (total > 0 ? n / total : 0);
  const failureClassRates = {};
  for (const [k, v] of Object.entries(failureClassCounts)) {
    failureClassRates[k] = rate(v);
  }

  const wallRaw = process.env.UNIFIED_SOAK_WALL_MS?.trim();
  const wallClockMs = wallRaw && Number.isFinite(Number(wallRaw)) ? Number(wallRaw) : null;

  return {
    iterations: total,
    parseErrors: 0,
    successCount: success,
    successRate: rate(success),
    missingTraceCount: missingTrace,
    missingTraceRate: rate(missingTrace),
    unclassifiedFailures,
    p95PrimaryElapsedMs: elapsedValues.length === 0 ? null : percentile(elapsedValues, 95),
    wallClockMs,
    latencySampleCount: elapsedValues.length,
    failureClassCounts,
    failureClassRates,
    dispatchFailureRate: rate(failureClassCounts.dispatch_failure ?? 0),
    policyFailureRate: rate(failureClassCounts.policy_failure ?? 0),
    providerLimitRate: rate(failureClassCounts.provider_limit ?? 0),
    stateUnavailableRate: rate(failureClassCounts.state_unavailable ?? 0),
  };
}

export function analyzeSoakJsonlContent(raw) {
  const records = extractDispatchJsonRecords(raw);
  return analyzeSoakDispatchRecords(records);
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
