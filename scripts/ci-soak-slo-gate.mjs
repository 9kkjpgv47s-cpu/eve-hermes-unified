#!/usr/bin/env node
/**
 * CI gate: read soak-metrics JSON (from ci-soak-metrics-from-jsonl.mjs) and fail if SLOs violated.
 * Env: UNIFIED_SOAK_MIN_SUCCESS_RATE (default 0.99), UNIFIED_SOAK_MAX_MISSING_TRACE_RATE (optional),
 *      UNIFIED_SOAK_MAX_UNCLASSIFIED (optional), UNIFIED_SOAK_MAX_P95_PRIMARY_MS (optional)
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateEvidenceGates } from "./evidence-gates.mjs";

function parseArgs(argv) {
  let metricsPath = "";
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--metrics" && argv[i + 1]) {
      metricsPath = argv[i + 1];
      i += 1;
    }
  }
  return { metricsPath };
}

function parseFloatEnv(name, fallback) {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function parseIntEnv(name, fallback) {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

async function main() {
  const { metricsPath: argPath } = parseArgs(process.argv.slice(2));
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const metricsPath = argPath
    ? path.isAbsolute(argPath)
      ? argPath
      : path.join(rootDir, argPath)
    : path.join(rootDir, process.env.UNIFIED_SOAK_METRICS_FILE?.trim() || "");

  if (!metricsPath) {
    throw new Error("Missing --metrics or UNIFIED_SOAK_METRICS_FILE");
  }

  const raw = await readFile(metricsPath, "utf8");
  const doc = JSON.parse(raw);
  const m = doc.metrics ?? doc;
  const total = Number(m.iterations ?? m.totalRecords ?? 0);
  const successRate = Number(m.successRate ?? (total > 0 ? (m.successCount ?? 0) / total : 0));
  const missingTraceRate = Number(m.missingTraceRate ?? (total > 0 ? (m.missingTraceCount ?? 0) / total : 1));
  const unclassifiedFailures = Number(m.unclassifiedFailures ?? 0);
  const p95LatencyMs = Number(m.p95PrimaryElapsedMs ?? m.p95LatencyMs ?? 0);

  const minSuccessRate = parseFloatEnv("UNIFIED_SOAK_MIN_SUCCESS_RATE", 0.99);
  const maxMissingTraceRate = parseFloatEnv("UNIFIED_SOAK_MAX_MISSING_TRACE_RATE", Number.NaN);
  const maxUnclassified = parseIntEnv("UNIFIED_SOAK_MAX_UNCLASSIFIED", Number.NaN);
  const maxP95 = parseFloatEnv("UNIFIED_SOAK_MAX_P95_PRIMARY_MS", Number.NaN);

  const gate = evaluateEvidenceGates(
    {
      successRate,
      missingTraceRate,
      unclassifiedFailures,
      p95LatencyMs: Number.isFinite(p95LatencyMs) ? p95LatencyMs : 0,
      failureScenarioPassCount: 99,
    },
    {
      minSuccessRate,
      maxMissingTraceRate,
      maxUnclassifiedFailures: Number.isFinite(maxUnclassified) ? maxUnclassified : Number.NaN,
      maxP95LatencyMs: maxP95,
      requireFailureScenarios: false,
    },
  );

  const out = {
    metricsPath: path.resolve(metricsPath),
    metrics: {
      iterations: total,
      successRate,
      missingTraceRate,
      unclassifiedFailures,
      p95PrimaryElapsedMs: p95LatencyMs,
    },
    thresholds: {
      minSuccessRate: Number.isFinite(minSuccessRate) ? minSuccessRate : null,
      maxMissingTraceRate: Number.isFinite(maxMissingTraceRate) ? maxMissingTraceRate : null,
      maxUnclassifiedFailures: Number.isFinite(maxUnclassified) ? maxUnclassified : null,
      maxP95PrimaryMs: Number.isFinite(maxP95) ? maxP95 : null,
    },
    pass: gate.passed,
    failures: gate.failures,
  };

  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  if (!gate.passed) {
    process.stderr.write(`Soak SLO gate failed:\n- ${gate.failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
