#!/usr/bin/env node
/**
 * Summarize soak JSONL lines (from scripts/soak-simulate.sh) into one metrics object for evidence gates.
 */
import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

/**
 * @param {number[]} sorted
 * @param {number} p
 */
function percentile(sorted, p) {
  if (sorted.length === 0) {
    return null;
  }
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function parseArgs(argv) {
  let input = "";
  let output = "";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") {
      input = argv[i + 1] ?? "";
      i += 1;
    } else if (arg === "--out") {
      output = argv[i + 1] ?? "";
      i += 1;
    }
  }
  return { input, output };
}

async function main() {
  const { input, output } = parseArgs(process.argv.slice(2));
  if (!input.trim()) {
    throw new Error("Missing --input <soak-report.jsonl>");
  }
  const outPath =
    output.trim() ||
    path.join(path.dirname(input), `soak-summary-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

  /** @type {number[]} */
  const elapsedSamples = [];
  let linesRead = 0;
  let linesParsed = 0;
  let parseErrors = 0;
  let tracePresent = 0;
  let successCount = 0;
  /** @type {Record<string, number>} */
  const failureHist = {};
  /** @type {Record<string, number>} */
  const laneHist = {};

  const rl = readline.createInterface({
    input: createReadStream(input, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    linesRead += 1;
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const payload = JSON.parse(trimmed);
      linesParsed += 1;
      if (payload.response?.traceId) {
        tracePresent += 1;
      }
      const fc = payload.response?.failureClass ?? "unknown";
      failureHist[fc] = (failureHist[fc] ?? 0) + 1;
      const lane = payload.response?.laneUsed ?? "unknown";
      laneHist[lane] = (laneHist[lane] ?? 0) + 1;
      if ((payload.response?.failureClass ?? "") === "none") {
        successCount += 1;
      }
      const ms = payload.primaryState?.elapsedMs;
      if (typeof ms === "number" && Number.isFinite(ms)) {
        elapsedSamples.push(ms);
      }
    } catch {
      parseErrors += 1;
    }
  }

  elapsedSamples.sort((a, b) => a - b);
  const traceIdPresentRate = linesParsed > 0 ? tracePresent / linesParsed : 0;
  const successRate = linesParsed > 0 ? successCount / linesParsed : 0;
  const elapsedMsP95 = percentile(elapsedSamples, 95);

  /** @type {string[]} */
  const driftAlarms = [];
  const minTrace = Number(process.env.UNIFIED_SOAK_MIN_TRACE_RATE ?? "0.99");
  const minSuccess = Number(process.env.UNIFIED_SOAK_MIN_SUCCESS_RATE ?? "0.95");
  const maxP95 = Number(process.env.UNIFIED_SOAK_MAX_P95_ELAPSED_MS ?? "2500");
  if (traceIdPresentRate < minTrace) {
    driftAlarms.push(`trace_id_present_rate_below_threshold:${traceIdPresentRate.toFixed(4)}<${minTrace}`);
  }
  if (successRate < minSuccess) {
    driftAlarms.push(`success_rate_below_threshold:${successRate.toFixed(4)}<${minSuccess}`);
  }
  if (elapsedMsP95 !== null && elapsedMsP95 > maxP95) {
    driftAlarms.push(`primary_elapsed_ms_p95_above_threshold:${elapsedMsP95}>${maxP95}`);
  }

  const metrics = {
    generatedAtIso: new Date().toISOString(),
    sourceReportPath: path.resolve(input),
    linesRead,
    linesParsed,
    parseErrors,
    traceIdPresentRate,
    successRate,
    failureClassHistogram: failureHist,
    laneUsedHistogram: laneHist,
    elapsedMsP95,
    driftAlarms,
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(metrics, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ ...metrics, outPath: path.resolve(outPath) }, null, 2)}\n`);

  if (driftAlarms.length > 0 && process.env.UNIFIED_SOAK_FAIL_ON_DRIFT === "1") {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
