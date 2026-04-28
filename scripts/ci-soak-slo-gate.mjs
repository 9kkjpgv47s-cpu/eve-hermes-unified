#!/usr/bin/env node
/**
 * Fail CI when soak metrics breach optional SLO env thresholds (uses evaluateEvidenceGates).
 */
import { readFileSync } from "node:fs";
import { evaluateEvidenceGates } from "./evidence-gates.mjs";

function parseArgs(argv) {
  const options = { metrics: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === "--metrics" || arg === "--in") {
      options.metrics = value ?? "";
      i += 1;
    }
  }
  return options;
}

function numEnv(name) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : Number.NaN;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.metrics) {
    console.error("Usage: node scripts/ci-soak-slo-gate.mjs --metrics <metrics.json>");
    process.exit(2);
  }
  const metrics = JSON.parse(readFileSync(options.metrics, "utf8"));

  const gate = evaluateEvidenceGates(
    {
      successRate: Number(metrics.successRate),
      missingTraceRate: Number(metrics.missingTraceRate),
      unclassifiedFailures: Number(metrics.unclassifiedFailures),
      p95LatencyMs: metrics.p95LatencyMs === null ? Number.NaN : Number(metrics.p95LatencyMs),
      failureScenarioPassCount: Number.POSITIVE_INFINITY,
      dispatchFailureRate: Number(metrics.dispatchFailureRate),
      policyFailureRate: Number(metrics.policyFailureRate),
    },
    {
      minSuccessRate: numEnv("UNIFIED_SOAK_MIN_SUCCESS_RATE"),
      maxMissingTraceRate: numEnv("UNIFIED_SOAK_MAX_MISSING_TRACE_RATE"),
      maxUnclassifiedFailures: numEnv("UNIFIED_SOAK_MAX_UNCLASSIFIED_FAILURES"),
      maxP95LatencyMs: numEnv("UNIFIED_SOAK_MAX_P95_LATENCY_MS"),
      maxDispatchFailureRate: numEnv("UNIFIED_SOAK_MAX_DISPATCH_FAILURE_RATE"),
      maxPolicyFailureRate: numEnv("UNIFIED_SOAK_MAX_POLICY_FAILURE_RATE"),
    },
  );

  if (!gate.passed) {
    process.stderr.write(`Soak SLO gate failed:\n- ${gate.failures.join("\n- ")}\n`);
    process.exit(2);
  }
  process.stdout.write("Soak SLO gate passed\n");
}

main();
