#!/usr/bin/env node
/**
 * Parse soak JSONL (one compact JSON object per line) and emit aggregate metrics for SLO gates.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const options = { input: "", out: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === "--input" || arg === "--in") {
      options.input = value ?? "";
      i += 1;
    } else if (arg === "--out") {
      options.out = value ?? "";
      i += 1;
    }
  }
  return options;
}

function isDispatchRecord(row) {
  return Boolean(row && typeof row === "object" && row.response && row.envelope);
}

function classifyFailureClassKnown(value) {
  return (
    value === "none" ||
    value === "provider_limit" ||
    value === "cooldown" ||
    value === "dispatch_failure" ||
    value === "state_unavailable" ||
    value === "policy_failure"
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.input) {
    console.error("Usage: node scripts/ci-soak-metrics-from-jsonl.mjs --input <soak.jsonl> [--out <metrics.json>]");
    process.exit(2);
  }
  const raw = readFileSync(options.input, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);

  let total = 0;
  let success = 0;
  let missingTrace = 0;
  let unclassifiedFailures = 0;
  const failureClassCounts = {
    none: 0,
    provider_limit: 0,
    cooldown: 0,
    dispatch_failure: 0,
    state_unavailable: 0,
    policy_failure: 0,
  };
  const elapsedValues = [];

  for (const line of lines) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isDispatchRecord(row)) {
      continue;
    }
    total += 1;
    const fc = row.response?.failureClass;
    if (fc === "none") {
      success += 1;
    }
    const traceId = row.response?.traceId ?? row.envelope?.traceId;
    if (!traceId || String(traceId).trim().length === 0) {
      missingTrace += 1;
    }
    if (!classifyFailureClassKnown(fc)) {
      unclassifiedFailures += 1;
    }
    if (typeof fc === "string" && Object.prototype.hasOwnProperty.call(failureClassCounts, fc)) {
      failureClassCounts[fc] += 1;
    }
    const ms = row.primaryState?.elapsedMs;
    const capMs = row.capabilityExecution?.elapsedMs;
    const pick =
      typeof ms === "number" && Number.isFinite(ms) && ms >= 0
        ? ms
        : typeof capMs === "number" && Number.isFinite(capMs) && capMs >= 0
          ? capMs
          : null;
    if (pick !== null) {
      elapsedValues.push(pick);
    }
  }

  elapsedValues.sort((a, b) => a - b);
  const p95Index =
    elapsedValues.length > 0
      ? Math.min(elapsedValues.length - 1, Math.ceil(elapsedValues.length * 0.95) - 1)
      : -1;
  const p95LatencyMs = p95Index >= 0 ? elapsedValues[p95Index] : null;

  const rate = (n) => (total > 0 ? n / total : 0);
  const failureClassRates = {};
  for (const [k, v] of Object.entries(failureClassCounts)) {
    failureClassRates[k] = rate(v);
  }

  const metrics = {
    inputPath: path.resolve(options.input),
    totalRecords: total,
    successRecords: success,
    successRate: rate(success),
    missingTraceCount: missingTrace,
    missingTraceRate: rate(missingTrace),
    unclassifiedFailures,
    p95LatencyMs,
    latencySampleCount: elapsedValues.length,
    failureClassCounts,
    failureClassRates,
    dispatchFailureRate: rate(failureClassCounts.dispatch_failure),
    policyFailureRate: rate(failureClassCounts.policy_failure),
    providerLimitRate: rate(failureClassCounts.provider_limit),
    stateUnavailableRate: rate(failureClassCounts.state_unavailable),
    cooldownRate: rate(failureClassCounts.cooldown),
  };

  const outJson = `${JSON.stringify(metrics, null, 2)}\n`;
  if (options.out) {
    writeFileSync(options.out, outJson, "utf8");
    process.stdout.write(`${path.resolve(options.out)}\n`);
  } else {
    process.stdout.write(outJson);
  }
}

main();
