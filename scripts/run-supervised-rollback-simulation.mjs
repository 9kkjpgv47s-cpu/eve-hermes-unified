#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

function parseArgs(argv) {
  const options = {
    evidenceDir: "",
    horizonStatusFile: "",
    envFile: "",
    out: "",
    stage: "majority",
    currentStage: "canary",
    canaryChats: "",
    majorityPercent: "",
    calibrationFile: "",
    evidenceSelectionMode: "latest-passing",
    dryRun: false,
    allowHorizonMismatch: false,
    skipCutoverReadiness: false,
    timeoutMs: 240_000,
    forceRollbackMinSuccessRate: Number.NaN,
    forceRollbackMaxP95LatencyMs: Number.NaN,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--evidence-dir") {
      options.evidenceDir = value ?? "";
      index += 1;
    } else if (arg === "--horizon-status-file") {
      options.horizonStatusFile = value ?? "";
      index += 1;
    } else if (arg === "--env-file" || arg === "--runtime-env-file") {
      options.envFile = value ?? "";
      index += 1;
    } else if (arg === "--out") {
      options.out = value ?? "";
      index += 1;
    } else if (arg === "--stage") {
      options.stage = value ?? "";
      index += 1;
    } else if (arg === "--current-stage") {
      options.currentStage = value ?? "";
      index += 1;
    } else if (arg === "--canary-chats") {
      options.canaryChats = value ?? "";
      index += 1;
    } else if (arg === "--majority-percent") {
      options.majorityPercent = value ?? "";
      index += 1;
    } else if (arg === "--calibration-file") {
      options.calibrationFile = value ?? "";
      index += 1;
    } else if (arg === "--evidence-selection-mode" || arg === "--evidence-selection") {
      options.evidenceSelectionMode = value ?? "";
      index += 1;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--allow-horizon-mismatch") {
      options.allowHorizonMismatch = true;
    } else if (arg === "--skip-cutover-readiness") {
      options.skipCutoverReadiness = true;
    } else if (arg === "--timeout-ms") {
      options.timeoutMs = Number(value ?? "240000");
      index += 1;
    } else if (arg === "--force-rollback-min-success-rate") {
      options.forceRollbackMinSuccessRate = Number(value ?? "");
      index += 1;
    } else if (arg === "--force-rollback-max-p95-latency-ms") {
      options.forceRollbackMaxP95LatencyMs = Number(value ?? "");
      index += 1;
    }
  }
  return options;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeEvidenceSelection(value, fallback = "latest-passing") {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "latest" || normalized === "latest-passing") {
    return normalized;
  }
  return fallback;
}

function stamp() {
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

async function readJsonMaybe(targetPath) {
  if (!(await exists(targetPath))) {
    return null;
  }
  try {
    return JSON.parse(await readFile(targetPath, "utf8"));
  } catch {
    return null;
  }
}

async function runCommand(argv, options = {}) {
  const startedAtMs = Date.now();
  return await new Promise((resolve) => {
    const [command, ...args] = argv;
    const child = spawn(command, args, {
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs ?? 240_000);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({
        argv,
        code: Number(code ?? -1),
        signal: signal ?? null,
        stdout,
        stderr,
        durationMs: Date.now() - startedAtMs,
        termination: timedOut ? "timeout" : signal ? "signal" : "exit",
      });
    });
  });
}

function parseEnvValue(text, key) {
  const match = new RegExp(`^${key}=([^\\n\\r]*)$`, "m").exec(text);
  return match ? String(match[1] ?? "").trim() : "";
}

async function readEnvSnapshot(envFile) {
  if (!(await exists(envFile))) {
    return null;
  }
  const raw = await readFile(envFile, "utf8");
  return {
    file: envFile,
    stage:
      parseEnvValue(raw, "UNIFIED_ROUTER_CUTOVER_STAGE") ||
      parseEnvValue(raw, "UNIFIED_ROUTER_STAGE") ||
      "",
    defaultPrimary: parseEnvValue(raw, "UNIFIED_ROUTER_DEFAULT_PRIMARY"),
    defaultFallback: parseEnvValue(raw, "UNIFIED_ROUTER_DEFAULT_FALLBACK"),
    failClosed: parseEnvValue(raw, "UNIFIED_ROUTER_FAIL_CLOSED"),
    canaryChats: parseEnvValue(raw, "UNIFIED_ROUTER_CANARY_CHAT_IDS"),
    majorityPercent: parseEnvValue(raw, "UNIFIED_ROUTER_MAJORITY_PERCENT"),
  };
}

function resolveRollbackForcingThresholds(calibrationPayload, options) {
  const calibrated = calibrationPayload?.calibration?.recommendedThresholds ?? {};
  const forcedMinSuccessRate = Number.isFinite(options.forceRollbackMinSuccessRate)
    ? options.forceRollbackMinSuccessRate
    : 1.01;
  const forcedMaxP95LatencyMs = Number.isFinite(options.forceRollbackMaxP95LatencyMs)
    ? options.forceRollbackMaxP95LatencyMs
    : Number(calibrated.maxP95LatencyMs ?? 2000);
  return {
    calibrated,
    forcing: {
      minSuccessRate: forcedMinSuccessRate,
      maxMissingTraceRate: Number(calibrated.maxMissingTraceRate ?? 0),
      maxUnclassifiedFailures: Number(calibrated.maxUnclassifiedFailures ?? 0),
      minFailureScenarioPassCount: Number(calibrated.minFailureScenarioPassCount ?? 5),
      maxP95LatencyMs: forcedMaxP95LatencyMs,
    },
  };
}

function resolveBooleanCandidate(checks, keys) {
  for (const key of keys) {
    if (typeof checks?.[key] === "boolean") {
      return checks[key] === true;
    }
  }
  return false;
}

function parseBooleanEnv(value, fallback = false) {
  if (!isNonEmptyString(value)) {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function resolveStageDrillGoalPolicySignals(stageDrillPayload) {
  const checks =
    stageDrillPayload?.checks && typeof stageDrillPayload.checks === "object"
      ? stageDrillPayload.checks
      : {};
  const mergeBundleReleaseReported = resolveBooleanCandidate(checks, [
    "rollbackStagePromotionMergeBundleGoalPolicyValidationReported",
  ]);
  const mergeBundleReleasePassed = resolveBooleanCandidate(checks, [
    "rollbackStagePromotionMergeBundleGoalPolicyValidationPassed",
  ]);
  const mergeBundleInitialScopeReported = resolveBooleanCandidate(checks, [
    "rollbackStagePromotionMergeBundleInitialScopeGoalPolicyValidationReported",
  ]);
  const mergeBundleInitialScopePassed = resolveBooleanCandidate(checks, [
    "rollbackStagePromotionMergeBundleInitialScopeGoalPolicyValidationPassed",
  ]);
  const bundleVerificationReleaseReported = resolveBooleanCandidate(checks, [
    "rollbackStagePromotionBundleVerificationGoalPolicyValidationReported",
  ]);
  const bundleVerificationReleasePassed = resolveBooleanCandidate(checks, [
    "rollbackStagePromotionBundleVerificationGoalPolicyValidationPassed",
  ]);
  const bundleVerificationInitialScopeReported = resolveBooleanCandidate(checks, [
    "rollbackStagePromotionBundleVerificationInitialScopeGoalPolicyValidationReported",
  ]);
  const bundleVerificationInitialScopePassed = resolveBooleanCandidate(checks, [
    "rollbackStagePromotionBundleVerificationInitialScopeGoalPolicyValidationPassed",
  ]);
  const mergeBundleReleaseSourceConsistencyReported = resolveBooleanCandidate(checks, [
    "rollbackStagePromotionMergeBundleGoalPolicySourceConsistencyReported",
  ]);
  const mergeBundleReleaseSourceConsistencyPassed = resolveBooleanCandidate(checks, [
    "rollbackStagePromotionMergeBundleGoalPolicySourceConsistencyPassed",
  ]);
  const bundleVerificationReleaseSourceConsistencyReported = resolveBooleanCandidate(checks, [
    "rollbackStagePromotionBundleVerificationGoalPolicySourceConsistencyReported",
  ]);
  const bundleVerificationReleaseSourceConsistencyPassed = resolveBooleanCandidate(checks, [
    "rollbackStagePromotionBundleVerificationGoalPolicySourceConsistencyPassed",
  ]);
  const validationPropagationReported = resolveBooleanCandidate(checks, [
    "rollbackStagePromotionGoalPolicyPropagationReported",
    "rollbackPolicyStageSignalsReported",
  ]) || (
    mergeBundleReleaseReported &&
    mergeBundleInitialScopeReported &&
    bundleVerificationReleaseReported &&
    bundleVerificationInitialScopeReported
  );
  const validationPropagationPassed = resolveBooleanCandidate(checks, [
    "rollbackStagePromotionGoalPolicyPropagationPassed",
    "rollbackPolicyStageSignalsPass",
  ]) || (
    mergeBundleReleasePassed &&
    mergeBundleInitialScopePassed &&
    bundleVerificationReleasePassed &&
    bundleVerificationInitialScopePassed
  );
  const sourceConsistencyPropagationReported = resolveBooleanCandidate(checks, [
    "rollbackStagePromotionGoalPolicySourceConsistencyPropagationReported",
  ]) || (
    mergeBundleReleaseSourceConsistencyReported &&
    bundleVerificationReleaseSourceConsistencyReported
  );
  const sourceConsistencyPropagationPassed = resolveBooleanCandidate(checks, [
    "rollbackStagePromotionGoalPolicySourceConsistencyPropagationPassed",
  ]) || (
    mergeBundleReleaseSourceConsistencyPassed &&
    bundleVerificationReleaseSourceConsistencyPassed
  );
  const propagationReported =
    validationPropagationReported &&
    sourceConsistencyPropagationReported;
  const propagationPassed =
    validationPropagationPassed &&
    sourceConsistencyPropagationPassed;
  return {
    mergeBundleReleaseReported,
    mergeBundleReleasePassed,
    mergeBundleReleaseSourceConsistencyReported,
    mergeBundleReleaseSourceConsistencyPassed,
    mergeBundleInitialScopeReported,
    mergeBundleInitialScopePassed,
    bundleVerificationReleaseReported,
    bundleVerificationReleasePassed,
    bundleVerificationReleaseSourceConsistencyReported,
    bundleVerificationReleaseSourceConsistencyPassed,
    bundleVerificationInitialScopeReported,
    bundleVerificationInitialScopePassed,
    validationPropagationReported,
    validationPropagationPassed,
    sourceConsistencyPropagationReported,
    sourceConsistencyPropagationPassed,
    propagationReported,
    propagationPassed,
  };
}

function extractJsonObjectFromText(text) {
  const raw = String(text ?? "").trim();
  if (!raw) {
    return null;
  }
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }
  const candidate = raw.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const evidenceDir = path.resolve(options.evidenceDir || path.join(process.cwd(), "evidence"));
  const horizonStatusFile = path.resolve(
    options.horizonStatusFile || path.join(process.cwd(), "docs/HORIZON_STATUS.json"),
  );
  const envFile = path.resolve(
    options.envFile ||
      process.env.UNIFIED_RUNTIME_ENV_FILE ||
      path.join(process.env.HOME || "", ".openclaw/run/gateway.env"),
  );
  const stageStamp = stamp();
  const outPath = path.resolve(
    options.out || path.join(evidenceDir, `supervised-rollback-simulation-${stageStamp}.json`),
  );
  const evidenceSelectionMode = normalizeEvidenceSelection(
    options.evidenceSelectionMode,
    "latest-passing",
  );
  const calibrationPath = path.resolve(
    options.calibrationFile ||
      path.join(evidenceDir, `rollback-threshold-calibration-${options.stage}-${stageStamp}.json`),
  );
  const stageDrillOut = path.join(evidenceDir, `supervised-stage-drill-${stageStamp}.json`);
  const cutoverReadinessOut = path.join(evidenceDir, `supervised-cutover-readiness-${stageStamp}.json`);

  const failures = [];
  const stage = String(options.stage ?? "").trim().toLowerCase();
  const currentStage = String(options.currentStage ?? "").trim().toLowerCase();
  if (!(await exists(evidenceDir))) {
    failures.push(`missing_evidence_dir:${evidenceDir}`);
  }
  if (!(await exists(horizonStatusFile))) {
    failures.push(`missing_horizon_status_file:${horizonStatusFile}`);
  }
  if (!(await exists(envFile))) {
    failures.push(`missing_env_file:${envFile}`);
  }
  if (stage !== "canary" && stage !== "majority" && stage !== "full") {
    failures.push(`invalid_stage:${stage || "<empty>"}`);
  }
  if (
    currentStage.length > 0 &&
    currentStage !== "shadow" &&
    currentStage !== "canary" &&
    currentStage !== "majority" &&
    currentStage !== "full"
  ) {
    failures.push(`invalid_current_stage:${currentStage}`);
  }
  if (
    isNonEmptyString(options.evidenceSelectionMode) &&
    options.evidenceSelectionMode !== "latest" &&
    options.evidenceSelectionMode !== "latest-passing"
  ) {
    failures.push(`invalid_evidence_selection_mode:${String(options.evidenceSelectionMode)}`);
  }

  if (failures.length > 0) {
    const payload = {
      generatedAtIso: new Date().toISOString(),
      pass: false,
      stage: stage || null,
      dryRun: options.dryRun,
      files: {
        evidenceDir,
        envFile,
        horizonStatusFile,
        outPath,
        calibrationPath,
        stageDrillOut,
        cutoverReadinessOut,
      },
      calibration: {
        source: "missing",
        recommended: null,
        forcing: null,
      },
      checks: {
        calibrationPass: false,
        stageDrillEvaluated: false,
        rollbackTriggered: false,
        rollbackApplied: false,
        cutoverReadinessSkipped: options.skipCutoverReadiness,
        cutoverReadinessPass: null,
        shadowRestored: false,
        evidenceSelectionMode,
      },
      env: {
        before: null,
        after: null,
      },
      commands: {
        calibration: null,
        stageDrill: null,
        cutoverReadiness: null,
      },
      failures,
    };
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    process.stderr.write(`Supervised rollback simulation failed:\n- ${failures.join("\n- ")}\n`);
    process.exitCode = 2;
    return;
  }

  let calibrationCommand = null;
  let calibrationPayload = await readJsonMaybe(calibrationPath);
  if (!calibrationPayload) {
    const calibrationArgv = [
      "node",
      "scripts/calibrate-rollback-thresholds.mjs",
      "--stage",
      stage || "majority",
      "--evidence-dir",
      evidenceDir,
      "--out",
      calibrationPath,
      "--evidence-selection-mode",
      evidenceSelectionMode,
    ];
    calibrationCommand = await runCommand(calibrationArgv, { timeoutMs: options.timeoutMs });
    calibrationPayload = await readJsonMaybe(calibrationPath);
    if (calibrationCommand.code !== 0 || calibrationPayload?.pass !== true) {
      failures.push("calibration_failed");
    }
  }

  if (!calibrationPayload) {
    failures.push("calibration_payload_missing");
  } else if (calibrationPayload.pass !== true) {
    failures.push("calibration_failed");
  }

  const thresholdSources = resolveRollbackForcingThresholds(calibrationPayload, options);
  const stageDrillArgv = [
    "node",
    "scripts/run-stage-drill.mjs",
    "--target-stage",
    stage || "majority",
    "--current-stage",
    currentStage || "canary",
    "--evidence-dir",
    evidenceDir,
    "--horizon-status-file",
    horizonStatusFile,
    "--runtime-env-file",
    envFile,
    "--out",
    stageDrillOut,
    "--rollback-min-success-rate",
    String(thresholdSources.forcing.minSuccessRate),
    "--rollback-max-missing-trace-rate",
    String(thresholdSources.forcing.maxMissingTraceRate),
    "--rollback-max-unclassified-failures",
    String(thresholdSources.forcing.maxUnclassifiedFailures),
    "--rollback-min-failure-scenario-pass-count",
    String(thresholdSources.forcing.minFailureScenarioPassCount),
    "--rollback-max-p95-latency-ms",
    String(thresholdSources.forcing.maxP95LatencyMs),
    "--evidence-selection-mode",
    evidenceSelectionMode,
    "--timeout-ms",
    String(options.timeoutMs),
  ];
  if (!options.dryRun) {
    stageDrillArgv.push("--auto-apply-rollback");
  }
  if (options.dryRun) {
    stageDrillArgv.push("--dry-run");
  }
  if (options.allowHorizonMismatch) {
    stageDrillArgv.push("--allow-horizon-mismatch");
  }
  if (isNonEmptyString(options.canaryChats)) {
    stageDrillArgv.push("--canary-chats", options.canaryChats);
  }
  if (isNonEmptyString(options.majorityPercent)) {
    stageDrillArgv.push("--majority-percent", options.majorityPercent);
  }

  const envBefore = await readEnvSnapshot(envFile);
  const stageDrillCommand = await runCommand(stageDrillArgv, {
    timeoutMs: options.timeoutMs,
    env: { UNIFIED_RUNTIME_ENV_FILE: envFile },
  });
  let stageDrillPayload = await readJsonMaybe(stageDrillOut);
  if (!stageDrillPayload) {
    stageDrillPayload = extractJsonObjectFromText(stageDrillCommand.stdout);
  }
  const stageDrillGoalPolicySignals = resolveStageDrillGoalPolicySignals(stageDrillPayload);
  const forceMissingStageDrillSignals = parseBooleanEnv(
    process.env.UNIFIED_FORCE_MISSING_STAGE_DRILL_SIGNALS,
    false,
  );
  const effectiveStageDrillGoalPolicySignals = forceMissingStageDrillSignals
    ? {
        ...stageDrillGoalPolicySignals,
        mergeBundleReleaseReported: false,
        mergeBundleReleasePassed: false,
        mergeBundleReleaseSourceConsistencyReported: false,
        mergeBundleReleaseSourceConsistencyPassed: false,
        mergeBundleInitialScopeReported: false,
        mergeBundleInitialScopePassed: false,
        bundleVerificationReleaseReported: false,
        bundleVerificationReleasePassed: false,
        bundleVerificationReleaseSourceConsistencyReported: false,
        bundleVerificationReleaseSourceConsistencyPassed: false,
        bundleVerificationInitialScopeReported: false,
        bundleVerificationInitialScopePassed: false,
        validationPropagationReported: false,
        validationPropagationPassed: false,
        sourceConsistencyPropagationReported: false,
        sourceConsistencyPropagationPassed: false,
        propagationReported: false,
        propagationPassed: false,
      }
    : stageDrillGoalPolicySignals;
  if (!stageDrillPayload) {
    failures.push("stage_drill_payload_missing");
  } else if (!effectiveStageDrillGoalPolicySignals.validationPropagationReported) {
    failures.push("stage_drill_goal_policy_propagation_not_reported");
    failures.push("stage_drill_goal_policy_signals_not_reported");
  } else if (!effectiveStageDrillGoalPolicySignals.sourceConsistencyPropagationReported) {
    failures.push("stage_drill_goal_policy_source_consistency_not_reported");
  } else if (!effectiveStageDrillGoalPolicySignals.validationPropagationPassed) {
    failures.push("stage_drill_goal_policy_propagation_not_passed");
    failures.push("stage_drill_goal_policy_signals_not_passed");
  } else if (!effectiveStageDrillGoalPolicySignals.sourceConsistencyPropagationPassed) {
    failures.push("stage_drill_goal_policy_source_consistency_not_passed");
  }

  const rollbackTriggered = stageDrillPayload?.decision?.action === "rollback";
  const rollbackApplied = stageDrillPayload?.decision?.rollbackApplied === true;
  if (!rollbackTriggered) {
    failures.push("rollback_not_triggered");
  }
  if (!options.dryRun && !rollbackApplied) {
    failures.push("rollback_not_applied");
  }

  let cutoverReadinessCommand = null;
  let cutoverReadinessPayload = null;
  if (!options.skipCutoverReadiness) {
    const cutoverReadinessArgv = ["bash", "scripts/verify-cutover-readiness.sh"];
    cutoverReadinessCommand = await runCommand(cutoverReadinessArgv, {
      timeoutMs: options.timeoutMs,
      env: {
        UNIFIED_RUNTIME_ENV_FILE: envFile,
        UNIFIED_CUTOVER_READINESS_REPORT_PATH: cutoverReadinessOut,
      },
    });
    cutoverReadinessPayload = await readJsonMaybe(cutoverReadinessOut);
    if (!cutoverReadinessPayload) {
      failures.push("cutover_readiness_payload_missing");
    } else if (cutoverReadinessPayload.pass !== true) {
      failures.push("cutover_readiness_failed_after_rollback");
    }
  }

  const envAfter = await readEnvSnapshot(envFile);
  const shadowRestored =
    envAfter?.stage === "shadow" &&
    envAfter?.defaultPrimary === "eve" &&
    envAfter?.defaultFallback === "none" &&
    envAfter?.failClosed === "1" &&
    envAfter?.majorityPercent === "0";
  if (!options.dryRun && !shadowRestored) {
    failures.push("env_not_restored_to_eve_safe_shadow");
  }

  const payload = {
    generatedAtIso: new Date().toISOString(),
    pass: failures.length === 0,
    stage: stage || null,
    dryRun: options.dryRun,
    files: {
      evidenceDir,
      envFile,
      horizonStatusFile,
      outPath,
      calibrationPath,
      stageDrillOut,
      cutoverReadinessOut,
    },
    calibration: {
      source: calibrationPayload ? "existing_or_generated" : "missing",
      recommended: thresholdSources.calibrated,
      forcing: thresholdSources.forcing,
    },
    checks: {
      calibrationPass: calibrationPayload?.pass === true,
      stageDrillEvaluated: stageDrillCommand.code === 0 || stageDrillCommand.code === 2,
      stageDrillGoalPolicyPropagationReported: effectiveStageDrillGoalPolicySignals.propagationReported,
      stageDrillGoalPolicyPropagationPassed: effectiveStageDrillGoalPolicySignals.propagationPassed,
      stageDrillGoalPolicyValidationPropagationReported:
        effectiveStageDrillGoalPolicySignals.validationPropagationReported,
      stageDrillGoalPolicyValidationPropagationPassed:
        effectiveStageDrillGoalPolicySignals.validationPropagationPassed,
      stageDrillGoalPolicySourceConsistencyPropagationReported:
        effectiveStageDrillGoalPolicySignals.sourceConsistencyPropagationReported,
      stageDrillGoalPolicySourceConsistencyPropagationPassed:
        effectiveStageDrillGoalPolicySignals.sourceConsistencyPropagationPassed,
      stageDrillStageSignalsReported: effectiveStageDrillGoalPolicySignals.propagationReported,
      stageDrillStageSignalsPassed: effectiveStageDrillGoalPolicySignals.propagationPassed,
      stageDrillStagePolicySignalsReported: effectiveStageDrillGoalPolicySignals.propagationReported,
      stageDrillStagePolicySignalsPass: effectiveStageDrillGoalPolicySignals.propagationPassed,
      stageDrillStageSourceConsistencySignalsReported:
        effectiveStageDrillGoalPolicySignals.sourceConsistencyPropagationReported,
      stageDrillStageSourceConsistencySignalsPass:
        effectiveStageDrillGoalPolicySignals.sourceConsistencyPropagationPassed,
      stageDrillMergeBundleGoalPolicyValidationReported:
        effectiveStageDrillGoalPolicySignals.mergeBundleReleaseReported,
      stageDrillMergeBundleGoalPolicyValidationPassed:
        effectiveStageDrillGoalPolicySignals.mergeBundleReleasePassed,
      stageDrillMergeBundleGoalPolicySourceConsistencyReported:
        effectiveStageDrillGoalPolicySignals.mergeBundleReleaseSourceConsistencyReported,
      stageDrillMergeBundleGoalPolicySourceConsistencyPassed:
        effectiveStageDrillGoalPolicySignals.mergeBundleReleaseSourceConsistencyPassed,
      stageDrillMergeBundleInitialScopeGoalPolicyValidationReported:
        effectiveStageDrillGoalPolicySignals.mergeBundleInitialScopeReported,
      stageDrillMergeBundleInitialScopeGoalPolicyValidationPassed:
        effectiveStageDrillGoalPolicySignals.mergeBundleInitialScopePassed,
      stageDrillBundleVerificationGoalPolicyValidationReported:
        effectiveStageDrillGoalPolicySignals.bundleVerificationReleaseReported,
      stageDrillBundleVerificationGoalPolicyValidationPassed:
        effectiveStageDrillGoalPolicySignals.bundleVerificationReleasePassed,
      stageDrillBundleVerificationGoalPolicySourceConsistencyReported:
        effectiveStageDrillGoalPolicySignals.bundleVerificationReleaseSourceConsistencyReported,
      stageDrillBundleVerificationGoalPolicySourceConsistencyPassed:
        effectiveStageDrillGoalPolicySignals.bundleVerificationReleaseSourceConsistencyPassed,
      stageDrillBundleVerificationInitialScopeGoalPolicyValidationReported:
        effectiveStageDrillGoalPolicySignals.bundleVerificationInitialScopeReported,
      stageDrillBundleVerificationInitialScopeGoalPolicyValidationPassed:
        effectiveStageDrillGoalPolicySignals.bundleVerificationInitialScopePassed,
      rollbackTriggered,
      rollbackApplied,
      cutoverReadinessSkipped: options.skipCutoverReadiness,
      cutoverReadinessPass: options.skipCutoverReadiness
        ? null
        : cutoverReadinessPayload?.pass === true,
      shadowRestored,
      evidenceSelectionMode,
    },
    env: {
      before: envBefore,
      after: envAfter,
    },
    commands: {
      calibration: calibrationCommand,
      stageDrill: stageDrillCommand,
      cutoverReadiness: cutoverReadinessCommand,
    },
    failures,
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (!payload.pass) {
    process.stderr.write(`Supervised rollback simulation failed:\n- ${failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
