#!/usr/bin/env node
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const VALID_STAGES = ["shadow", "canary", "majority", "full"];
const STAGE_INDEX = new Map(VALID_STAGES.map((stage, index) => [stage, index]));
const DECISION_HOLD = "hold";
const DECISION_ROLLBACK = "rollback";

function parseArgs(argv) {
  const options = {
    evidenceDir: "",
    stage: "",
    envFile: "",
    out: "",
    autoApplyRollback: false,
    horizonStatusFile: "",
    minSuccessRate: Number.NaN,
    maxMissingTraceRate: Number.NaN,
    maxUnclassifiedFailures: Number.NaN,
    minFailureScenarioPassCount: Number.NaN,
    maxP95LatencyMs: Number.NaN,
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
    } else if (arg === "--env-file") {
      options.envFile = value ?? "";
      index += 1;
    } else if (arg === "--horizon-status-file") {
      options.horizonStatusFile = value ?? "";
      index += 1;
    } else if (arg === "--out") {
      options.out = value ?? "";
      index += 1;
    } else if (arg === "--auto-apply-rollback") {
      options.autoApplyRollback = true;
    } else if (arg === "--min-success-rate") {
      options.minSuccessRate = Number(value ?? "");
      index += 1;
    } else if (arg === "--max-missing-trace-rate") {
      options.maxMissingTraceRate = Number(value ?? "");
      index += 1;
    } else if (arg === "--max-unclassified-failures") {
      options.maxUnclassifiedFailures = Number(value ?? "");
      index += 1;
    } else if (arg === "--min-failure-scenario-pass-count") {
      options.minFailureScenarioPassCount = Number(value ?? "");
      index += 1;
    } else if (arg === "--max-p95-latency-ms") {
      options.maxP95LatencyMs = Number(value ?? "");
      index += 1;
    }
  }
  return options;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeStage(value, fallback = "") {
  const normalized = String(value ?? "").trim().toLowerCase();
  return VALID_STAGES.includes(normalized) ? normalized : fallback;
}

function toFiniteNumber(value, fallback) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function formatStamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
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

async function readJson(targetPath) {
  const raw = await readFile(targetPath, "utf8");
  return JSON.parse(raw);
}

async function newestFileInDir(dir, prefix) {
  const entries = await readdir(dir, { withFileTypes: true });
  const matches = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix))
    .map((entry) => path.join(dir, entry.name))
    .sort();
  return matches.length > 0 ? matches[matches.length - 1] : "";
}

async function newestPassingValidationSummary(evidenceDir) {
  const entries = await readdir(evidenceDir, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith("validation-summary-"))
    .map((entry) => path.join(evidenceDir, entry.name))
    .sort()
    .reverse();
  for (const candidate of candidates) {
    try {
      const payload = await readJson(candidate);
      if (payload?.gates?.passed === true) {
        return candidate;
      }
    } catch {
      continue;
    }
  }
  return candidates.length > 0 ? candidates[0] : "";
}

async function newestPassingReport(evidenceDir, prefix) {
  const entries = await readdir(evidenceDir, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix))
    .map((entry) => path.join(evidenceDir, entry.name))
    .sort()
    .reverse();
  for (const candidate of candidates) {
    try {
      const payload = await readJson(candidate);
      if (payload?.pass === true) {
        return candidate;
      }
    } catch {
      continue;
    }
  }
  return candidates.length > 0 ? candidates[0] : "";
}

function evaluateThresholds(stage, metrics, thresholds) {
  const reasons = [];
  const minSuccessRate = thresholds.minSuccessRate;
  const maxMissingTraceRate = thresholds.maxMissingTraceRate;
  const maxUnclassifiedFailures = thresholds.maxUnclassifiedFailures;
  const minFailureScenarioPassCount = thresholds.minFailureScenarioPassCount;
  const maxP95LatencyMs = thresholds.maxP95LatencyMs;

  if (metrics.successRate < minSuccessRate) {
    reasons.push(`success_rate_below_threshold:${metrics.successRate}<${minSuccessRate}`);
  }
  if (metrics.missingTraceRate > maxMissingTraceRate) {
    reasons.push(
      `missing_trace_rate_above_threshold:${metrics.missingTraceRate}>${maxMissingTraceRate}`,
    );
  }
  if (metrics.unclassifiedFailures > maxUnclassifiedFailures) {
    reasons.push(
      `unclassified_failures_above_threshold:${metrics.unclassifiedFailures}>${maxUnclassifiedFailures}`,
    );
  }
  if ((stage === "majority" || stage === "full") && metrics.failureScenarioPassCount < minFailureScenarioPassCount) {
    reasons.push(
      `failure_scenario_pass_count_below_threshold:${metrics.failureScenarioPassCount}<${minFailureScenarioPassCount}`,
    );
  }
  if (metrics.p95LatencyMs > maxP95LatencyMs) {
    reasons.push(`p95_latency_above_threshold:${metrics.p95LatencyMs}>${maxP95LatencyMs}`);
  }

  return reasons;
}

async function runRollbackCommand(envFile) {
  const argv = ["bash", "scripts/prod-rollback-eve-safe-lane.sh"];
  const startedAt = new Date().toISOString();
  return await new Promise((resolve) => {
    const child = spawn(argv[0], argv.slice(1), {
      env: {
        ...process.env,
        UNIFIED_RUNTIME_ENV_FILE: envFile,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code, signal) => {
      resolve({
        argv,
        startedAtIso: startedAt,
        finishedAtIso: new Date().toISOString(),
        code: Number(code ?? -1),
        signal: signal ?? null,
        stdout,
        stderr,
        pass: code === 0,
      });
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const evidenceDir = path.resolve(options.evidenceDir || path.join(process.cwd(), "evidence"));
  const horizonStatusFile = path.resolve(
    options.horizonStatusFile || path.join(process.cwd(), "docs/HORIZON_STATUS.json"),
  );
  const envFile = path.resolve(
    options.envFile || process.env.UNIFIED_RUNTIME_ENV_FILE || path.join(process.env.HOME || "", ".openclaw/run/gateway.env"),
  );

  const validationSummaryPath = await newestPassingValidationSummary(evidenceDir);
  const cutoverReadinessPath = await newestPassingReport(evidenceDir, "cutover-readiness-");
  const releaseReadinessPath = await newestPassingReport(evidenceDir, "release-readiness-");
  const stagePromotionPath = await newestPassingReport(evidenceDir, "stage-promotion-readiness-");

  const failures = [];
  if (!(await exists(validationSummaryPath))) {
    failures.push("missing_validation_summary");
  }
  if (!(await exists(cutoverReadinessPath))) {
    failures.push("missing_cutover_readiness");
  }
  if (!(await exists(releaseReadinessPath))) {
    failures.push("missing_release_readiness");
  }
  if (!(await exists(stagePromotionPath))) {
    failures.push("missing_stage_promotion_readiness");
  }

  let horizonStatus = null;
  if (await exists(horizonStatusFile)) {
    horizonStatus = await readJson(horizonStatusFile);
  } else {
    failures.push("missing_horizon_status_file");
  }

  const activeHorizon = String(horizonStatus?.activeHorizon ?? "");
  const inferredStage = normalizeStage(
    options.stage || (activeHorizon === "H2" ? "canary" : activeHorizon === "H3" ? "majority" : activeHorizon === "H4" || activeHorizon === "H5" ? "full" : "shadow"),
    "shadow",
  );
  const stage = normalizeStage(options.stage, inferredStage);
  if (!VALID_STAGES.includes(stage)) {
    failures.push(`invalid_stage:${options.stage || "<empty>"}`);
  }

  const validationSummary = await readJson(validationSummaryPath);
  const cutoverReadiness = await readJson(cutoverReadinessPath);
  const releaseReadiness = await readJson(releaseReadinessPath);
  const stagePromotion = await readJson(stagePromotionPath);

  if (validationSummary?.gates?.passed !== true) {
    failures.push("validation_summary_gate_failed");
  }
  if (cutoverReadiness?.pass !== true) {
    failures.push("cutover_readiness_failed");
  }
  if (releaseReadiness?.pass !== true) {
    failures.push("release_readiness_failed");
  }
  if (stagePromotion?.pass !== true) {
    failures.push("stage_promotion_readiness_failed");
  }

  const metrics = {
    successRate: toFiniteNumber(validationSummary?.metrics?.successRate, 0),
    missingTraceRate: toFiniteNumber(validationSummary?.metrics?.missingTraceRate, 1),
    unclassifiedFailures: toFiniteNumber(validationSummary?.metrics?.unclassifiedFailures, Number.POSITIVE_INFINITY),
    failureScenarioPassCount: toFiniteNumber(validationSummary?.metrics?.failureScenarioPassCount, 0),
    p95LatencyMs: toFiniteNumber(validationSummary?.metrics?.p95LatencyMs, Number.POSITIVE_INFINITY),
  };

  const thresholds = {
    minSuccessRate: toFiniteNumber(options.minSuccessRate, stage === "canary" ? 0.99 : 0.995),
    maxMissingTraceRate: toFiniteNumber(options.maxMissingTraceRate, 0),
    maxUnclassifiedFailures: toFiniteNumber(options.maxUnclassifiedFailures, 0),
    minFailureScenarioPassCount: toFiniteNumber(options.minFailureScenarioPassCount, stage === "canary" ? 5 : 5),
    maxP95LatencyMs: toFiniteNumber(options.maxP95LatencyMs, stage === "canary" ? 2500 : 2000),
  };
  const thresholdReasons = evaluateThresholds(stage, metrics, thresholds);
  const stageRequiresRollback = stage !== "shadow" && stage !== "canary"
    ? thresholdReasons.length > 0
    : thresholdReasons.length > 0 && metrics.successRate < 0.98;

  const decisionReasons = [...failures];
  if (thresholdReasons.length > 0) {
    decisionReasons.push(...thresholdReasons);
  }

  const decision = stageRequiresRollback || failures.length > 0
    ? DECISION_ROLLBACK
    : DECISION_HOLD;
  const shouldApplyRollback = options.autoApplyRollback && decision === DECISION_ROLLBACK;

  let rollbackExecution = null;
  if (shouldApplyRollback) {
    if (!(await exists(envFile))) {
      decisionReasons.push(`missing_env_file:${envFile}`);
    } else {
      rollbackExecution = await runRollbackCommand(envFile);
      if (!rollbackExecution.pass) {
        decisionReasons.push("rollback_command_failed");
      }
    }
  }

  const outPath = path.resolve(
    options.out || path.join(evidenceDir, `auto-rollback-policy-${formatStamp()}.json`),
  );
  const payload = {
    generatedAtIso: new Date().toISOString(),
    pass: decisionReasons.length === 0 && decision === DECISION_HOLD,
    decision: {
      action: decision,
      shouldRollback: decision === DECISION_ROLLBACK,
      autoApplyRollbackRequested: options.autoApplyRollback,
      rollbackApplied: rollbackExecution?.pass === true,
    },
    stage,
    autoApplyRollback: options.autoApplyRollback,
    rollbackApplied: rollbackExecution?.pass === true,
    reasons: decisionReasons,
    triggers: decisionReasons,
    files: {
      evidenceDir,
      horizonStatusFile: await exists(horizonStatusFile) ? horizonStatusFile : null,
      envFile: await exists(envFile) ? envFile : null,
      validationSummary: validationSummaryPath || null,
      cutoverReadiness: cutoverReadinessPath || null,
      releaseReadiness: releaseReadinessPath || null,
      stagePromotionReadiness: stagePromotionPath || null,
      outPath,
    },
    checks: {
      activeHorizon: isNonEmptyString(activeHorizon) ? activeHorizon : null,
      metrics,
      thresholds,
      thresholdReasons,
      validationSummaryPassed: validationSummary?.gates?.passed === true,
      cutoverReadinessPassed: cutoverReadiness?.pass === true,
      releaseReadinessPassed: releaseReadiness?.pass === true,
      stagePromotionReadinessPassed: stagePromotion?.pass === true,
    },
    rollbackExecution,
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);

  if (decision === DECISION_ROLLBACK) {
    process.exitCode = shouldApplyRollback ? (rollbackExecution?.pass === true ? 2 : 2) : 2;
    process.stderr.write(`Auto-rollback policy evaluation failed:\n- ${decisionReasons.join("\n- ")}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
