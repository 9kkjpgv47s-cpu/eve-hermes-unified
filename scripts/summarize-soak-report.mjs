#!/usr/bin/env node
/**
 * Reads JSONL soak output from scripts/soak-simulate.sh (each line: one unified-dispatch JSON blob).
 * Emits summary JSON with trace presence rate, success rate, P95 elapsed (primary lane), drift alarms.
 */
import { readFileSync } from "node:fs";

const reportPath = process.argv[2];
if (!reportPath) {
  console.error("Usage: node summarize-soak-report.mjs <jsonl-file>");
  process.exit(2);
}

function numEnv(name, fallback) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : fallback;
}

const minTraceRate = numEnv("UNIFIED_SOAK_MIN_TRACE_RATE", 0.95);
const minSuccessRate = numEnv("UNIFIED_SOAK_MIN_SUCCESS_RATE", 0.85);
const maxP95Ms = numEnv("UNIFIED_SOAK_MAX_P95_ELAPSED_MS", 60_000);
const failOnDrift = process.env.UNIFIED_SOAK_FAIL_ON_DRIFT === "1";

const raw = readFileSync(reportPath, "utf8");
const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);

let parsedCount = 0;
let tracePresent = 0;
let successCount = 0;
const elapsedMs = [];

for (const line of lines) {
  let row;
  try {
    row = JSON.parse(line);
  } catch {
    continue;
  }
  parsedCount += 1;
  const tid = row?.envelope?.traceId ?? row?.traceId;
  if (typeof tid === "string" && tid.length > 0) {
    tracePresent += 1;
  }
  const fc = row?.response?.failureClass;
  const primaryOk = row?.primaryState?.status === "pass";
  const capOk = row?.capabilityExecution?.status === "pass";
  if (fc === "none" || primaryOk || capOk) {
    successCount += 1;
  }
  const ms = row?.primaryState?.elapsedMs;
  if (typeof ms === "number" && Number.isFinite(ms) && ms >= 0) {
    elapsedMs.push(ms);
  }
}

elapsedMs.sort((a, b) => a - b);
const p95Index = elapsedMs.length > 0 ? Math.min(elapsedMs.length - 1, Math.ceil(elapsedMs.length * 0.95) - 1) : -1;
const p95 = p95Index >= 0 ? elapsedMs[p95Index] : null;

const traceIdPresentRate = parsedCount > 0 ? tracePresent / parsedCount : 0;
const successRate = parsedCount > 0 ? successCount / parsedCount : 0;

const driftAlarms = [];
if (traceIdPresentRate < minTraceRate) {
  driftAlarms.push({
    id: "trace_id_presence",
    observed: traceIdPresentRate,
    threshold: minTraceRate,
  });
}
if (successRate < minSuccessRate) {
  driftAlarms.push({
    id: "success_rate",
    observed: successRate,
    threshold: minSuccessRate,
  });
}
if (p95 !== null && p95 > maxP95Ms) {
  driftAlarms.push({
    id: "p95_elapsed_ms",
    observed: p95,
    threshold: maxP95Ms,
  });
}

const summary = {
  reportPath,
  linesTotal: lines.length,
  jsonLinesParsed: parsedCount,
  traceIdPresentRate,
  successRate,
  elapsedMsP95: p95,
  driftAlarms,
};

console.log(JSON.stringify(summary, null, 2));

if (failOnDrift && driftAlarms.length > 0) {
  process.exit(1);
}
