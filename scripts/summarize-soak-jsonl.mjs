#!/usr/bin/env node
/**
 * Summarize soak JSONL (one JSON UnifiedDispatchResult per line, possibly prefixed by stderr noise).
 * Emits drift alarms when failure-class or trace coverage looks off.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

async function findLatestSoakFile(rootDir) {
  const evidenceDir = path.join(rootDir, "evidence");
  let names = [];
  try {
    names = await readdir(evidenceDir);
  } catch {
    return null;
  }
  const soak = names
    .filter((n) => /^soak-.*\.jsonl$/i.test(n))
    .map((n) => path.join(evidenceDir, n));
  if (soak.length === 0) {
    return null;
  }
  soak.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
  return soak[soak.length - 1];
}

function parseArgs(argv) {
  const options = {
    input: "",
    out: "",
    minFailureClassRate: 0.001,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === "--input") {
      options.input = value ?? "";
      i += 1;
    } else if (arg === "--out") {
      options.out = value ?? "";
      i += 1;
    } else if (arg === "--min-failure-class-rate") {
      options.minFailureClassRate = Number.parseFloat(value ?? "0.001") || 0.001;
      i += 1;
    }
  }
  return options;
}

function extractJsonObjects(line) {
  const objects = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "{") {
      if (depth === 0) {
        start = i;
      }
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(line.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return objects;
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const opts = parseArgs(process.argv.slice(2));
  const inputPath =
    opts.input ||
    (await findLatestSoakFile(root)) ||
    path.join(root, "evidence", "soak-latest.jsonl");
  let raw = "";
  try {
    raw = await readFile(inputPath, "utf8");
  } catch (e) {
    console.error(`Cannot read input: ${inputPath}`, e);
    process.exit(2);
  }

  const failureClassCounts = {};
  const laneCounts = {};
  const routingReasonCounts = {};
  let parseErrors = 0;
  let lines = 0;
  let missingTrace = 0;
  let noneFailureClass = 0;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    lines += 1;
    let parsed;
    const trimmedStart = trimmed[0];
    if (trimmedStart === "{") {
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        parsed = undefined;
      }
    }
    if (!parsed) {
      const candidates = extractJsonObjects(trimmed);
      for (let i = candidates.length - 1; i >= 0; i -= 1) {
        try {
          parsed = JSON.parse(candidates[i]);
          break;
        } catch {
          // continue
        }
      }
    }
    if (!parsed || typeof parsed !== "object") {
      parseErrors += 1;
      continue;
    }
    const fc = parsed.response?.failureClass ?? parsed.primaryState?.failureClass;
    if (typeof fc === "string" && fc.length > 0) {
      failureClassCounts[fc] = (failureClassCounts[fc] ?? 0) + 1;
      if (fc === "none") {
        noneFailureClass += 1;
      }
    }
    const lane = parsed.response?.laneUsed;
    if (typeof lane === "string" && lane.length > 0) {
      laneCounts[lane] = (laneCounts[lane] ?? 0) + 1;
    }
    const reason = parsed.routing?.reason;
    if (typeof reason === "string" && reason.length > 0) {
      routingReasonCounts[reason] = (routingReasonCounts[reason] ?? 0) + 1;
    }
    const trace = parsed.envelope?.traceId ?? parsed.response?.traceId;
    if (!trace || String(trace).length === 0) {
      missingTrace += 1;
    }
  }

  const totalClassified = Object.values(failureClassCounts).reduce((a, b) => a + b, 0);
  const noneRate = totalClassified > 0 ? noneFailureClass / totalClassified : 0;
  const driftAlarms = [];
  if (parseErrors > 0) {
    driftAlarms.push({ code: "soak_parse_errors", count: parseErrors });
  }
  if (missingTrace > 0) {
    driftAlarms.push({ code: "soak_missing_trace", count: missingTrace });
  }
  if (totalClassified > 5 && noneRate < opts.minFailureClassRate) {
    driftAlarms.push({
      code: "soak_low_none_failure_class_rate",
      noneRate,
      threshold: opts.minFailureClassRate,
    });
  }

  const summary = {
    generatedAtIso: new Date().toISOString(),
    inputPath,
    lineCount: lines,
    parseErrors,
    missingTrace,
    failureClassCounts,
    laneCounts,
    routingReasonCounts,
    driftAlarms,
  };

  const json = `${JSON.stringify(summary, null, 2)}\n`;
  process.stdout.write(json);
  const outPath =
    opts.out ||
    path.join(root, "evidence", `soak-summary-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, json, "utf8");
  console.error(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
