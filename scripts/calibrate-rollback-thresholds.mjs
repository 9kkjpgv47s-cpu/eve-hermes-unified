#!/usr/bin/env node
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const VALID_STAGES = ["canary", "majority", "full"];
const VALID_EVIDENCE_SELECTION_MODES = ["latest", "latest-passing"];

function parseArgs(argv) {
  const options = {
    evidenceDir: "",
    stage: "majority",
    out: "",
    window: 5,
    minSamples: 3,
    evidenceSelectionMode: "latest-passing",
    successRateHeadroom: 0.0005,
    latencyBufferMs: 250,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--evidence-dir") {
      options.evidenceDir = value ?? "";
      index += 1;
    } else if (arg === "--stage") {
      options.stage = value ?? "";
      index += 1;
    } else if (arg === "--out") {
      options.out = value ?? "";
      index += 1;
    } else if (arg === "--window") {
      options.window = Number(value ?? "5");
      index += 1;
    } else if (arg === "--min-samples") {
      options.minSamples = Number(value ?? "3");
      index += 1;
    } else if (arg === "--evidence-selection-mode" || arg === "--evidence-selection") {
      options.evidenceSelectionMode = value ?? "";
      index += 1;
    } else if (arg === "--success-rate-headroom") {
      options.successRateHeadroom = Number(value ?? "0.0005");
      index += 1;
    } else if (arg === "--latency-buffer-ms") {
      options.latencyBufferMs = Number(value ?? "250");
      index += 1;
    }
  }
  return options;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeStage(value, fallback = "majority") {
  const normalized = String(value ?? "").trim().toLowerCase();
  return VALID_STAGES.includes(normalized) ? normalized : fallback;
}

function normalizeEvidenceSelection(value, fallback = "latest-passing") {
  const normalized = String(value ?? "").trim().toLowerCase();
  return VALID_EVIDENCE_SELECTION_MODES.includes(normalized) ? normalized : fallback;
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round4(value) {
  return Math.round(value * 10_000) / 10_000;
}

async function exists(targetPath) {
  if (!isNonEmptyString(targetPath)) {
    return false;
  }
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonMaybe(targetPath) {
  try {
    const raw = await readFile(targetPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function stageDefaults(stage) {
  const normalized = normalizeStage(stage, "majority");
  return {
    minSuccessRate: normalized === "canary" ? 0.99 : 0.995,
    maxMissingTraceRate: 0,
    maxUnclassifiedFailures: 0,
    minFailureScenarioPassCount: 5,
    maxP95LatencyMs: normalized === "canary" ? 2500 : 2000,
  };
}

function summarizeSamples(samples) {
  const successRates = [];
  const missingTraceRates = [];
  const unclassifiedFailures = [];
  const p95LatencyMsValues = [];
  const failureScenarioPassCounts = [];
  for (const sample of samples) {
    successRates.push(sample.metrics.successRate);
    missingTraceRates.push(sample.metrics.missingTraceRate);
    unclassifiedFailures.push(sample.metrics.unclassifiedFailures);
    p95LatencyMsValues.push(sample.metrics.p95LatencyMs);
    failureScenarioPassCounts.push(sample.metrics.failureScenarioPassCount);
  }
  return {
    sampleCount: samples.length,
    minSuccessRate: Math.min(...successRates),
    maxMissingTraceRate: Math.max(...missingTraceRates),
    maxUnclassifiedFailures: Math.max(...unclassifiedFailures),
    maxP95LatencyMs: Math.max(...p95LatencyMsValues),
    minFailureScenarioPassCount: Math.min(...failureScenarioPassCounts),
  };
}

function calibrateThresholds(stage, observed, options) {
  const defaults = stageDefaults(stage);
  const headroom = Number.isFinite(options.successRateHeadroom)
    ? options.successRateHeadroom
    : 0.0005;
  const latencyBufferMs = Number.isFinite(options.latencyBufferMs) ? options.latencyBufferMs : 250;

  const minSuccessRate = round4(
    clamp(
      Math.max(defaults.minSuccessRate, observed.minSuccessRate - headroom),
      defaults.minSuccessRate,
      0.9999,
    ),
  );
  const maxP95LatencyMs = Math.round(
    clamp(
      observed.maxP95LatencyMs + latencyBufferMs,
      250,
      defaults.maxP95LatencyMs,
    ),
  );

  return {
    ...defaults,
    minSuccessRate,
    maxP95LatencyMs,
  };
}

function calibrationArgs(thresholds) {
  return [
    "--min-success-rate",
    String(thresholds.minSuccessRate),
    "--max-missing-trace-rate",
    String(thresholds.maxMissingTraceRate),
    "--max-unclassified-failures",
    String(thresholds.maxUnclassifiedFailures),
    "--min-failure-scenario-pass-count",
    String(thresholds.minFailureScenarioPassCount),
    "--max-p95-latency-ms",
    String(thresholds.maxP95LatencyMs),
  ];
}

async function listValidationSummaries(evidenceDir) {
  const entries = await readdir(evidenceDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.startsWith("validation-summary-"))
    .map((entry) => path.join(evidenceDir, entry.name))
    .sort();
}

async function loadSample(filePath) {
  const payload = await readJsonMaybe(filePath);
  const successRate = Number(payload?.metrics?.successRate);
  const missingTraceRate = Number(payload?.metrics?.missingTraceRate);
  const unclassifiedFailures = Number(payload?.metrics?.unclassifiedFailures);
  const p95LatencyMs = Number(payload?.metrics?.p95LatencyMs);
  const failureScenarioPassCount = Number(payload?.metrics?.failureScenarioPassCount);
  if (
    !payload ||
    !Number.isFinite(successRate) ||
    !Number.isFinite(missingTraceRate) ||
    !Number.isFinite(unclassifiedFailures) ||
    !Number.isFinite(p95LatencyMs) ||
    !Number.isFinite(failureScenarioPassCount)
  ) {
    return null;
  }
  return {
    file: filePath,
    generatedAtIso: String(payload?.generatedAtIso ?? ""),
    gatesPassed: payload?.gates?.passed === true,
    metrics: {
      successRate,
      missingTraceRate,
      unclassifiedFailures,
      p95LatencyMs,
      failureScenarioPassCount,
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const evidenceDir = path.resolve(options.evidenceDir || path.join(process.cwd(), "evidence"));
  const requestedStage = String(options.stage ?? "");
  const stage = normalizeStage(requestedStage, "");
  const evidenceSelectionMode = normalizeEvidenceSelection(options.evidenceSelectionMode, "latest-passing");
  const windowSize = Number.isFinite(options.window) ? Math.max(1, Math.floor(options.window)) : 5;
  const minSamples = Number.isFinite(options.minSamples)
    ? Math.max(1, Math.floor(options.minSamples))
    : 3;
  const outPath = path.resolve(
    options.out ||
      path.join(evidenceDir, `rollback-threshold-calibration-${stage || "unknown"}-${stamp()}.json`),
  );

  const failures = [];
  if (!(await exists(evidenceDir))) {
    failures.push(`missing_evidence_dir:${evidenceDir}`);
  }
  if (!VALID_STAGES.includes(stage)) {
    failures.push(`invalid_stage:${requestedStage || "<empty>"}`);
  }
  if (
    isNonEmptyString(options.evidenceSelectionMode) &&
    !VALID_EVIDENCE_SELECTION_MODES.includes(evidenceSelectionMode)
  ) {
    failures.push(`invalid_evidence_selection_mode:${String(options.evidenceSelectionMode)}`);
  }
  if (!Number.isFinite(options.successRateHeadroom) || options.successRateHeadroom < 0) {
    failures.push(`invalid_success_rate_headroom:${String(options.successRateHeadroom)}`);
  }
  if (!Number.isFinite(options.latencyBufferMs) || options.latencyBufferMs < 0) {
    failures.push(`invalid_latency_buffer_ms:${String(options.latencyBufferMs)}`);
  }

  const allSummaryFiles = await (await exists(evidenceDir) ? listValidationSummaries(evidenceDir) : []);
  const loadedSamples = [];
  for (const filePath of allSummaryFiles) {
    const sample = await loadSample(filePath);
    if (sample) {
      loadedSamples.push(sample);
    }
  }

  const modePool =
    evidenceSelectionMode === "latest-passing"
      ? loadedSamples.filter((sample) => sample.gatesPassed === true)
      : loadedSamples;
  let selectionFallbackUsed = false;
  let selectedPool = modePool;
  if (evidenceSelectionMode === "latest-passing" && modePool.length === 0 && loadedSamples.length > 0) {
    selectedPool = loadedSamples;
    selectionFallbackUsed = true;
  }
  const selectedSamples = selectedPool.slice(-windowSize);

  if (allSummaryFiles.length === 0) {
    failures.push("no_validation_summary_files");
  }
  if (selectedSamples.length < minSamples) {
    failures.push(`insufficient_samples:${selectedSamples.length}<${minSamples}`);
  }

  const observed =
    selectedSamples.length > 0
      ? summarizeSamples(selectedSamples)
      : {
          sampleCount: 0,
          minSuccessRate: 0,
          maxMissingTraceRate: 1,
          maxUnclassifiedFailures: Number.POSITIVE_INFINITY,
          maxP95LatencyMs: Number.POSITIVE_INFINITY,
          minFailureScenarioPassCount: 0,
        };
  const recommendedThresholds = calibrateThresholds(stage || "majority", observed, options);
  const payload = {
    generatedAtIso: new Date().toISOString(),
    pass: failures.length === 0,
    stage: stage || null,
    files: {
      evidenceDir,
      outPath,
    },
    selection: {
      evidenceSelectionMode,
      windowSize,
      minSamples,
      selectionFallbackUsed,
      availableSummaryFiles: allSummaryFiles.length,
      parseableSummaryFiles: loadedSamples.length,
      selectedSampleCount: selectedSamples.length,
    },
    observed,
    calibration: {
      successRateHeadroom: options.successRateHeadroom,
      latencyBufferMs: options.latencyBufferMs,
      defaults: stageDefaults(stage || "majority"),
      recommendedThresholds,
      recommendedPolicyArgs: calibrationArgs(recommendedThresholds),
    },
    samples: selectedSamples,
    failures,
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (!payload.pass) {
    process.stderr.write(`Rollback threshold calibration failed:\n- ${failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
