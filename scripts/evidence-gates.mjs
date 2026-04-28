#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

const REQUIRED_SCENARIOS = [
  {
    id: "eve_timeout",
    label: "Eve lane command timeout",
    patterns: [/eve lane command timeout/i, /eve_dispatch_timeout/i],
  },
  {
    id: "hermes_non_zero",
    label: "Hermes lane non-zero exit",
    patterns: [/hermes lane non-zero exit/i, /hermes_dispatch_exit_/i],
  },
  {
    id: "provider_limit",
    label: "Synthetic provider-limit response mapping",
    patterns: [/provider-limit response mapping/i, /provider_limit/i],
  },
  {
    id: "dispatch_state_mismatch",
    label: "Dispatch-state read mismatch",
    patterns: [/dispatch-state read mismatch/i, /state_(mismatch|unavailable)/i],
  },
  {
    id: "fail_closed_no_fallback",
    label: "Policy fail-closed path with no fallback",
    patterns: [/policy fail-closed path with no fallback/i, /fail-closed/i, /fallback.*none/i],
  },
];

export function parseDurationMs(raw) {
  if (raw === undefined || raw === null || `${raw}`.trim().length === 0) {
    return Number.NaN;
  }
  const value = String(raw).trim().toLowerCase();
  const match = value.match(/^(\d+(?:\.\d+)?)(ms|s|m)?$/);
  if (!match) {
    return Number.NaN;
  }
  const amount = Number(match[1]);
  const unit = match[2] ?? "ms";
  if (!Number.isFinite(amount)) {
    return Number.NaN;
  }
  if (unit === "ms") {
    return Math.floor(amount);
  }
  if (unit === "s") {
    return Math.floor(amount * 1000);
  }
  return Math.floor(amount * 60_000);
}

export function classifyFailureClassKnown(value) {
  return (
    value === "none" ||
    value === "provider_limit" ||
    value === "cooldown" ||
    value === "dispatch_failure" ||
    value === "state_unavailable" ||
    value === "policy_failure"
  );
}

export function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) {
    return Number.NaN;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  const index = Math.max(0, Math.min(sorted.length - 1, rank));
  return sorted[index];
}

export function evaluateEvidenceGates(metrics, options) {
  const failures = [];
  const minSuccessRate = Number(options?.minSuccessRate);
  const maxMissingTraceRate = Number(options?.maxMissingTraceRate);
  const maxUnclassifiedFailures = Number(options?.maxUnclassifiedFailures);
  const maxP95LatencyMs = Number(options?.maxP95LatencyMs);
  const maxDispatchFailureRate = Number(options?.maxDispatchFailureRate);
  const maxPolicyFailureRate = Number(options?.maxPolicyFailureRate);

  if (Number.isFinite(minSuccessRate) && metrics.successRate < minSuccessRate) {
    failures.push(`successRate ${metrics.successRate.toFixed(4)} < ${minSuccessRate.toFixed(4)}`);
  }
  if (Number.isFinite(maxMissingTraceRate) && metrics.missingTraceRate > maxMissingTraceRate) {
    failures.push(
      `missingTraceRate ${metrics.missingTraceRate.toFixed(4)} > ${maxMissingTraceRate.toFixed(4)}`,
    );
  }
  if (
    Number.isFinite(maxUnclassifiedFailures) &&
    metrics.unclassifiedFailures > maxUnclassifiedFailures
  ) {
    failures.push(`unclassifiedFailures ${metrics.unclassifiedFailures} > ${maxUnclassifiedFailures}`);
  }
  if (Number.isFinite(maxP95LatencyMs) && Number(metrics.p95LatencyMs) > maxP95LatencyMs) {
    failures.push(`p95LatencyMs ${metrics.p95LatencyMs} > ${maxP95LatencyMs}`);
  }
  if (
    Number.isFinite(maxDispatchFailureRate) &&
    Number.isFinite(metrics.dispatchFailureRate) &&
    metrics.dispatchFailureRate > maxDispatchFailureRate
  ) {
    failures.push(
      `dispatchFailureRate ${metrics.dispatchFailureRate.toFixed(4)} > ${maxDispatchFailureRate.toFixed(4)}`,
    );
  }
  if (
    Number.isFinite(maxPolicyFailureRate) &&
    Number.isFinite(metrics.policyFailureRate) &&
    metrics.policyFailureRate > maxPolicyFailureRate
  ) {
    failures.push(
      `policyFailureRate ${metrics.policyFailureRate.toFixed(4)} > ${maxPolicyFailureRate.toFixed(4)}`,
    );
  }
  if (options?.requireFailureScenarios && metrics.failureScenarioPassCount < REQUIRED_SCENARIOS.length) {
    failures.push(
      `failureScenarioCoverage ${metrics.failureScenarioPassCount}/${REQUIRED_SCENARIOS.length} below required`,
    );
  }
  return {
    passed: failures.length === 0,
    failures,
  };
}

function parseArgs(argv) {
  const options = {
    summaryPath: "",
    failureReportPath: "",
    requireFailureScenarios: false,
    maxP95Ms: Number.NaN,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === "--summary") {
      options.summaryPath = value ?? "";
      i += 1;
    } else if (arg === "--failure-report") {
      options.failureReportPath = value ?? "";
      i += 1;
    } else if (arg === "--require-failure-scenarios") {
      options.requireFailureScenarios = value === undefined ? true : value !== "0";
      if (value !== undefined) {
        i += 1;
      }
    } else if (arg === "--max-p95-ms") {
      options.maxP95Ms = parseDurationMs(value);
      i += 1;
    }
  }

  if (!options.summaryPath) {
    throw new Error("Missing --summary");
  }
  if (!options.failureReportPath) {
    throw new Error("Missing --failure-report");
  }
  return options;
}

export function evaluateFailureScenarioCoverage(failureRaw) {
  const covered = [];
  const missing = [];
  for (const scenario of REQUIRED_SCENARIOS) {
    const matches = scenario.patterns.some((pattern) => pattern.test(failureRaw));
    if (matches) {
      covered.push(scenario.label);
    } else {
      missing.push(scenario.label);
    }
  }
  return {
    covered: covered.length,
    required: REQUIRED_SCENARIOS.length,
    coveredScenarios: covered,
    missing,
  };
}

async function runCli() {
  const options = parseArgs(process.argv.slice(2));
  const summaryRaw = await readFile(options.summaryPath, "utf8");
  const summary = JSON.parse(summaryRaw);
  const failureRaw = await readFile(options.failureReportPath, "utf8");
  const coverage = evaluateFailureScenarioCoverage(failureRaw);

  const p95ElapsedMs = Number(
    summary?.metrics?.p95LatencyMs ?? summary?.metrics?.p95ElapsedMs ?? summary?.metrics?.p95_ms ?? 0,
  );
  const maxP95Ms = Number.isFinite(options.maxP95Ms) ? options.maxP95Ms : Number.NaN;
  const priorGatePassed =
    summary?.gates?.passed === undefined ? true : Boolean(summary.gates.passed);
  const priorFailures = Array.isArray(summary?.gates?.failures) ? summary.gates.failures : [];

  const gateFailures = [...priorFailures];
  if (!priorGatePassed && priorFailures.length === 0) {
    gateFailures.push("summary_gate_failed");
  }
  if (Number.isFinite(maxP95Ms) && p95ElapsedMs > maxP95Ms) {
    gateFailures.push(`p95 latency gate failed: ${p95ElapsedMs}ms > ${maxP95Ms}ms`);
  }
  if (options.requireFailureScenarios && coverage.missing.length > 0) {
    gateFailures.push(`Missing required failure scenarios: ${coverage.missing.join(", ")}`);
  }

  const payload = {
    pass: gateFailures.length === 0,
    summaryPath: path.resolve(options.summaryPath),
    failureReportPath: path.resolve(options.failureReportPath),
    p95ElapsedMs,
    maxP95Ms: Number.isFinite(maxP95Ms) ? maxP95Ms : null,
    failureScenarioCoverage: coverage,
    failures: gateFailures,
  };

  process.stdout.write(`${JSON.stringify(payload)}\n`);
  if (gateFailures.length > 0) {
    process.stderr.write(`${gateFailures.join("\n")}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  runCli().catch((error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
