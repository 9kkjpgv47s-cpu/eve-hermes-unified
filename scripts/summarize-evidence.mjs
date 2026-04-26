#!/usr/bin/env node
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const options = {
    evidenceDir: "",
    out: "",
    minSuccessRate: Number.NaN,
    maxMissingTraceRate: Number.NaN,
    maxUnclassifiedFailures: Number.NaN,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === "--evidence-dir") {
      options.evidenceDir = value ?? "";
      i += 1;
    } else if (arg === "--out") {
      options.out = value ?? "";
      i += 1;
    } else if (arg === "--min-success-rate") {
      options.minSuccessRate = Number(value);
      i += 1;
    } else if (arg === "--max-missing-trace-rate") {
      options.maxMissingTraceRate = Number(value);
      i += 1;
    } else if (arg === "--max-unclassified-failures") {
      options.maxUnclassifiedFailures = Number(value);
      i += 1;
    }
  }
  if (!options.evidenceDir) {
    throw new Error("Missing --evidence-dir");
  }
  if (!options.out) {
    throw new Error("Missing --out");
  }
  return options;
}

function parseDispatchJsonFromLine(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && parsed.response && parsed.envelope) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function extractDispatchJsonRecords(raw) {
  const records = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let startIndex = -1;

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (ch === "{") {
      if (depth === 0) {
        startIndex = i;
      }
      depth += 1;
      continue;
    }

    if (ch === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && startIndex >= 0) {
        const candidate = raw.slice(startIndex, i + 1);
        try {
          const parsed = JSON.parse(candidate);
          if (parsed && typeof parsed === "object" && parsed.response && parsed.envelope) {
            records.push(parsed);
          }
        } catch {
          // Ignore non-dispatch JSON snippets.
        }
        startIndex = -1;
      }
    }
  }

  return records;
}

function isFailureClassKnown(value) {
  return (
    value === "none" ||
    value === "provider_limit" ||
    value === "cooldown" ||
    value === "dispatch_failure" ||
    value === "state_unavailable" ||
    value === "policy_failure"
  );
}

async function newestFileInDir(dir, prefix) {
  const entries = await readdir(dir, { withFileTypes: true });
  const matches = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix))
    .map((entry) => path.join(dir, entry.name));
  if (matches.length === 0) {
    return null;
  }
  matches.sort();
  return matches[matches.length - 1];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const soakFile = await newestFileInDir(options.evidenceDir, "soak-");
  const failureFile = await newestFileInDir(options.evidenceDir, "failure-injection-");
  if (!soakFile) {
    throw new Error("No soak report found.");
  }
  if (!failureFile) {
    throw new Error("No failure injection report found.");
  }

  const soakRaw = await readFile(soakFile, "utf8");
  const records = extractDispatchJsonRecords(soakRaw);

  const total = records.length;
  let success = 0;
  let missingTrace = 0;
  let unclassifiedFailures = 0;
  for (const record of records) {
    if (record?.response?.failureClass === "none") {
      success += 1;
    }
    const traceId = record?.response?.traceId ?? record?.envelope?.traceId;
    if (!traceId || String(traceId).trim().length === 0) {
      missingTrace += 1;
    }
    const failureClass = record?.response?.failureClass;
    if (!isFailureClassKnown(failureClass)) {
      unclassifiedFailures += 1;
    }
  }

  const successRate = total > 0 ? success / total : 0;
  const missingTraceRate = total > 0 ? missingTrace / total : 1;
  const failedGates = [];
  if (!Number.isNaN(options.minSuccessRate) && successRate < options.minSuccessRate) {
    failedGates.push(`successRate ${successRate.toFixed(4)} < ${options.minSuccessRate.toFixed(4)}`);
  }
  if (!Number.isNaN(options.maxMissingTraceRate) && missingTraceRate > options.maxMissingTraceRate) {
    failedGates.push(
      `missingTraceRate ${missingTraceRate.toFixed(4)} > ${options.maxMissingTraceRate.toFixed(4)}`,
    );
  }
  if (!Number.isNaN(options.maxUnclassifiedFailures) && unclassifiedFailures > options.maxUnclassifiedFailures) {
    failedGates.push(
      `unclassifiedFailures ${unclassifiedFailures} > ${options.maxUnclassifiedFailures}`,
    );
  }

  const failureRaw = await readFile(failureFile, "utf8");
  const summary = {
    generatedAtIso: new Date().toISOString(),
    files: {
      soak: soakFile,
      failureInjection: failureFile,
    },
    metrics: {
      totalRecords: total,
      successRecords: success,
      successRate,
      missingTraceCount: missingTrace,
      missingTraceRate,
      unclassifiedFailures,
    },
    gates: {
      minSuccessRate: Number.isNaN(options.minSuccessRate) ? null : options.minSuccessRate,
      maxMissingTraceRate: Number.isNaN(options.maxMissingTraceRate) ? null : options.maxMissingTraceRate,
      maxUnclassifiedFailures: Number.isNaN(options.maxUnclassifiedFailures)
        ? null
        : options.maxUnclassifiedFailures,
      passed: failedGates.length === 0,
      failures: failedGates,
    },
    failureInjectionPreview: failureRaw.split(/\r?\n/).slice(0, 60),
  };

  await mkdir(path.dirname(options.out), { recursive: true });
  await writeFile(options.out, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  process.stdout.write(`${options.out}\n`);
  if (failedGates.length > 0) {
    process.stderr.write(`Evidence gate failures:\n- ${failedGates.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
