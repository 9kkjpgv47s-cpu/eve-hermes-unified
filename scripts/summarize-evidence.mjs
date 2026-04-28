#!/usr/bin/env node
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { evaluateEvidenceGates, evaluateFailureScenarioCoverage } from "./evidence-gates.mjs";
import { extractDispatchJsonRecords } from "./dispatch-json-extract.mjs";
import { analyzeSoakDispatchRecords } from "./ci-soak-metrics-from-jsonl.mjs";

function parseArgs(argv) {
  const options = {
    evidenceDir: "",
    out: "",
    minSuccessRate: Number.NaN,
    maxP95LatencyMs: Number.NaN,
    maxMissingTraceRate: Number.NaN,
    maxUnclassifiedFailures: Number.NaN,
    maxDispatchFailureRate: Number.NaN,
    maxPolicyFailureRate: Number.NaN,
    requireFailureScenarios: false,
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
    } else if (arg === "--max-p95-latency-ms") {
      options.maxP95LatencyMs = Number(value);
      i += 1;
    } else if (arg === "--max-dispatch-failure-rate") {
      options.maxDispatchFailureRate = Number(value);
      i += 1;
    } else if (arg === "--max-policy-failure-rate") {
      options.maxPolicyFailureRate = Number(value);
      i += 1;
    } else if (arg === "--require-failure-scenarios") {
      options.requireFailureScenarios = true;
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

async function newestFileInDir(dir, prefix, { suffix } = {}) {
  const entries = await readdir(dir, { withFileTypes: true });
  const matches = entries
    .filter((entry) => {
      if (!entry.isFile() || !entry.name.startsWith(prefix)) {
        return false;
      }
      if (suffix && !entry.name.endsWith(suffix)) {
        return false;
      }
      return true;
    })
    .map((entry) => path.join(dir, entry.name));
  if (matches.length === 0) {
    return null;
  }
  matches.sort();
  return matches[matches.length - 1];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const soakFile = await newestFileInDir(options.evidenceDir, "soak-", { suffix: ".jsonl" });
  const failureFile = await newestFileInDir(options.evidenceDir, "failure-injection-");
  if (!soakFile) {
    throw new Error("No soak report found.");
  }
  if (!failureFile) {
    throw new Error("No failure injection report found.");
  }

  const soakRaw = await readFile(soakFile, "utf8");
  const records = extractDispatchJsonRecords(soakRaw);
  const soakDerived = analyzeSoakDispatchRecords(records);

  const total = soakDerived.iterations;
  const successRate = soakDerived.successRate;
  const missingTrace = soakDerived.missingTraceCount;
  const missingTraceRate = soakDerived.missingTraceRate;
  const unclassifiedFailures = soakDerived.unclassifiedFailures;
  const p95LatencyMs =
    soakDerived.p95PrimaryElapsedMs === null || soakDerived.p95PrimaryElapsedMs === undefined
      ? null
      : Number(soakDerived.p95PrimaryElapsedMs);
  const dispatchFailureRate = Number(soakDerived.dispatchFailureRate ?? 0);
  const policyFailureRate = Number(soakDerived.policyFailureRate ?? 0);

  const failureRaw = await readFile(failureFile, "utf8");
  const failureLines = failureRaw.split(/\r?\n/);
  const scenarioCoverage = evaluateFailureScenarioCoverage(failureRaw);

  const gateEvaluation = evaluateEvidenceGates(
    {
      successRate,
      missingTraceRate,
      unclassifiedFailures,
      p95LatencyMs: p95LatencyMs === null ? 0 : p95LatencyMs,
      failureScenarioPassCount: scenarioCoverage.covered,
      dispatchFailureRate,
      policyFailureRate,
    },
    {
      minSuccessRate: options.minSuccessRate,
      maxMissingTraceRate: options.maxMissingTraceRate,
      maxUnclassifiedFailures: options.maxUnclassifiedFailures,
      maxP95LatencyMs: options.maxP95LatencyMs,
      maxDispatchFailureRate: options.maxDispatchFailureRate,
      maxPolicyFailureRate: options.maxPolicyFailureRate,
      requireFailureScenarios: options.requireFailureScenarios,
    },
  );

  const summary = {
    generatedAtIso: new Date().toISOString(),
    files: {
      soak: soakFile,
      failureInjection: failureFile,
    },
    metrics: {
      totalRecords: total,
      successRecords: soakDerived.successCount,
      successRate,
      missingTraceCount: missingTrace,
      missingTraceRate,
      unclassifiedFailures,
      p95LatencyMs,
      latencySampleCount: soakDerived.latencySampleCount,
      failureScenarioPassCount: scenarioCoverage.covered,
      failureClassCounts: soakDerived.failureClassCounts,
      failureClassRates: soakDerived.failureClassRates,
      dispatchFailureRate,
      policyFailureRate,
      providerLimitRate: soakDerived.providerLimitRate,
      stateUnavailableRate: soakDerived.stateUnavailableRate,
      cooldownRate: soakDerived.cooldownRate,
    },
    failureScenarios: {
      coveredScenarios: scenarioCoverage.coveredScenarios,
      missingScenarios: scenarioCoverage.missing,
      covered: scenarioCoverage.covered,
      required: scenarioCoverage.required,
    },
    gates: {
      minSuccessRate: Number.isNaN(options.minSuccessRate) ? null : options.minSuccessRate,
      maxMissingTraceRate: Number.isNaN(options.maxMissingTraceRate) ? null : options.maxMissingTraceRate,
      maxUnclassifiedFailures: Number.isNaN(options.maxUnclassifiedFailures)
        ? null
        : options.maxUnclassifiedFailures,
      maxP95LatencyMs: Number.isNaN(options.maxP95LatencyMs) ? null : options.maxP95LatencyMs,
      maxDispatchFailureRate: Number.isNaN(options.maxDispatchFailureRate)
        ? null
        : options.maxDispatchFailureRate,
      maxPolicyFailureRate: Number.isNaN(options.maxPolicyFailureRate) ? null : options.maxPolicyFailureRate,
      requireFailureScenarios: options.requireFailureScenarios,
      passed: gateEvaluation.passed,
      failures: gateEvaluation.failures,
    },
    failureInjectionPreview: failureLines.slice(0, 80),
  };

  await mkdir(path.dirname(options.out), { recursive: true });
  await writeFile(options.out, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  process.stdout.write(`${options.out}\n`);
  if (!gateEvaluation.passed) {
    process.stderr.write(`Evidence gate failures:\n- ${gateEvaluation.failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
