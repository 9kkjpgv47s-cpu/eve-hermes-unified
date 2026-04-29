#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { validateManifestSchema } from "./validate-manifest-schema.mjs";

const HORIZON_SEQUENCE = ["H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8", "H9", "H10", "H11", "H12", "H13", "H14", "H15", "H16", "H17"];

function parseArgs(argv) {
  const options = {
    evidenceDir: "",
    horizonStatusFile: "",
    envFile: "",
    out: "",
    horizon: "H2",
    stage: "majority",
    currentStage: "canary",
    nextHorizon: "H3",
    canaryChats: "",
    majorityPercent: "",
    timeoutMs: 300_000,
    evidenceSelectionMode: "latest-passing",
    dryRun: false,
    allowHorizonMismatch: false,
    skipCutoverReadiness: false,
    calibrationOut: "",
    simulationOut: "",
    closeoutOut: "",
    forceRollbackMinSuccessRate: Number.NaN,
    forceRollbackMaxP95LatencyMs: Number.NaN,
    requireActiveNextHorizon: false,
    requireCompletedActions: true,
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
    } else if (arg === "--horizon") {
      options.horizon = value ?? "";
      index += 1;
    } else if (arg === "--stage") {
      options.stage = value ?? "";
      index += 1;
    } else if (arg === "--current-stage") {
      options.currentStage = value ?? "";
      index += 1;
    } else if (arg === "--next-horizon") {
      options.nextHorizon = value ?? "";
      index += 1;
    } else if (arg === "--canary-chats") {
      options.canaryChats = value ?? "";
      index += 1;
    } else if (arg === "--majority-percent") {
      options.majorityPercent = value ?? "";
      index += 1;
    } else if (arg === "--timeout-ms") {
      options.timeoutMs = Number(value ?? "300000");
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
    } else if (arg === "--calibration-out") {
      options.calibrationOut = value ?? "";
      index += 1;
    } else if (arg === "--simulation-out") {
      options.simulationOut = value ?? "";
      index += 1;
    } else if (arg === "--closeout-out") {
      options.closeoutOut = value ?? "";
      index += 1;
    } else if (arg === "--force-rollback-min-success-rate") {
      options.forceRollbackMinSuccessRate = Number(value ?? "");
      index += 1;
    } else if (arg === "--force-rollback-max-p95-latency-ms") {
      options.forceRollbackMaxP95LatencyMs = Number(value ?? "");
      index += 1;
    } else if (arg === "--require-active-next-horizon") {
      options.requireActiveNextHorizon = true;
    } else if (arg === "--allow-incomplete-actions") {
      options.requireCompletedActions = false;
    }
  }
  return options;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeEvidenceSelectionMode(value, fallback = "latest-passing") {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "latest" || normalized === "latest-passing") {
    return normalized;
  }
  return fallback;
}

function normalizeStage(value, fallback = "majority") {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "canary" || normalized === "majority" || normalized === "full"
    ? normalized
    : fallback;
}

function normalizeHorizon(value, fallback = "H3") {
  const normalized = String(value ?? "").trim().toUpperCase();
  return HORIZON_SEQUENCE.includes(normalized)
    ? normalized
    : fallback;
}

function deriveNextHorizon(sourceHorizon) {
  const sourceIndex = HORIZON_SEQUENCE.indexOf(sourceHorizon);
  if (sourceIndex < 0 || sourceIndex >= HORIZON_SEQUENCE.length - 1) {
    return "";
  }
  return HORIZON_SEQUENCE[sourceIndex + 1];
}

function appendCloseoutGateFailure(failures, sourceHorizon) {
  failures.push("horizon_closeout_gate_failed");
  if (sourceHorizon === "H2") {
    failures.push("h2_closeout_gate_failed");
  }
}

function resolveBooleanCandidate(checks, keys) {
  for (const key of keys) {
    if (checks?.[key] === true) {
      return true;
    }
  }
  return false;
}

function resolveSimulationStageGoalPolicySignals(simulationPayload) {
  const checks =
    simulationPayload?.checks && typeof simulationPayload.checks === "object"
      ? simulationPayload.checks
      : {};
  const directValidationPropagationReported = resolveBooleanCandidate(checks, [
    "stageDrillGoalPolicyPropagationReported",
    "stageDrillGoalPolicyValidationPropagationReported",
    "stageDrillStageSignalsReported",
    "stageDrillStagePolicySignalsReported",
  ]);
  const directValidationPropagationPassed = resolveBooleanCandidate(checks, [
    "stageDrillGoalPolicyPropagationPassed",
    "stageDrillGoalPolicyValidationPropagationPassed",
    "stageDrillStageSignalsPass",
    "stageDrillStagePolicySignalsPass",
  ]);
  const directSourceConsistencyPropagationReported = resolveBooleanCandidate(checks, [
    "stageDrillGoalPolicySourceConsistencyPropagationReported",
    "stageDrillStageSourceConsistencySignalsReported",
  ]);
  const directSourceConsistencyPropagationPassed = resolveBooleanCandidate(checks, [
    "stageDrillGoalPolicySourceConsistencyPropagationPassed",
    "stageDrillStageSourceConsistencySignalsPass",
  ]);
  const mergeBundleReleaseReported = resolveBooleanCandidate(checks, [
    "stageDrillRollbackStagePromotionMergeBundleGoalPolicyValidationReported",
    "stageDrillRollbackStagePromotionMergeBundleReleaseGoalPolicyValidationReported",
    "stageDrillMergeBundleGoalPolicyValidationReported",
    "stageDrillRollbackPolicyStageSignalsReported",
  ]);
  const mergeBundleReleasePassed = resolveBooleanCandidate(checks, [
    "stageDrillRollbackStagePromotionMergeBundleGoalPolicyValidationPassed",
    "stageDrillRollbackStagePromotionMergeBundleReleaseGoalPolicyValidationPassed",
    "stageDrillMergeBundleGoalPolicyValidationPassed",
    "stageDrillRollbackPolicyStageSignalsPass",
  ]);
  const mergeBundleInitialScopeReported = resolveBooleanCandidate(checks, [
    "stageDrillRollbackStagePromotionMergeBundleInitialScopeGoalPolicyValidationReported",
  ]);
  const mergeBundleInitialScopePassed = resolveBooleanCandidate(checks, [
    "stageDrillRollbackStagePromotionMergeBundleInitialScopeGoalPolicyValidationPassed",
  ]);
  const mergeBundleReleaseSourceConsistencyReported = resolveBooleanCandidate(checks, [
    "stageDrillRollbackStagePromotionMergeBundleGoalPolicySourceConsistencyReported",
    "stageDrillRollbackStagePromotionMergeBundleReleaseGoalPolicySourceConsistencyReported",
    "stageDrillMergeBundleGoalPolicySourceConsistencyReported",
  ]);
  const mergeBundleReleaseSourceConsistencyPassed = resolveBooleanCandidate(checks, [
    "stageDrillRollbackStagePromotionMergeBundleGoalPolicySourceConsistencyPassed",
    "stageDrillRollbackStagePromotionMergeBundleReleaseGoalPolicySourceConsistencyPassed",
    "stageDrillMergeBundleGoalPolicySourceConsistencyPassed",
  ]);
  const bundleVerificationReleaseReported = resolveBooleanCandidate(checks, [
    "stageDrillRollbackStagePromotionBundleVerificationGoalPolicyValidationReported",
    "stageDrillRollbackStagePromotionBundleVerificationReleaseGoalPolicyValidationReported",
  ]);
  const bundleVerificationReleasePassed = resolveBooleanCandidate(checks, [
    "stageDrillRollbackStagePromotionBundleVerificationGoalPolicyValidationPassed",
    "stageDrillRollbackStagePromotionBundleVerificationReleaseGoalPolicyValidationPassed",
  ]);
  const bundleVerificationInitialScopeReported = resolveBooleanCandidate(checks, [
    "stageDrillRollbackStagePromotionBundleVerificationInitialScopeGoalPolicyValidationReported",
  ]);
  const bundleVerificationInitialScopePassed = resolveBooleanCandidate(checks, [
    "stageDrillRollbackStagePromotionBundleVerificationInitialScopeGoalPolicyValidationPassed",
  ]);
  const bundleVerificationReleaseSourceConsistencyReported = resolveBooleanCandidate(checks, [
    "stageDrillRollbackStagePromotionBundleVerificationGoalPolicySourceConsistencyReported",
    "stageDrillRollbackStagePromotionBundleVerificationReleaseGoalPolicySourceConsistencyReported",
    "stageDrillBundleVerificationGoalPolicySourceConsistencyReported",
  ]);
  const bundleVerificationReleaseSourceConsistencyPassed = resolveBooleanCandidate(checks, [
    "stageDrillRollbackStagePromotionBundleVerificationGoalPolicySourceConsistencyPassed",
    "stageDrillRollbackStagePromotionBundleVerificationReleaseGoalPolicySourceConsistencyPassed",
    "stageDrillBundleVerificationGoalPolicySourceConsistencyPassed",
  ]);
  const validationPropagationReported = directValidationPropagationReported || (
    mergeBundleReleaseReported
    && mergeBundleInitialScopeReported
    && bundleVerificationReleaseReported
    && bundleVerificationInitialScopeReported
  );
  const validationPropagationPassed = directValidationPropagationPassed || (
    mergeBundleReleasePassed
    && mergeBundleInitialScopePassed
    && bundleVerificationReleasePassed
    && bundleVerificationInitialScopePassed
  );
  const sourceConsistencyPropagationReported = directSourceConsistencyPropagationReported || (
    mergeBundleReleaseSourceConsistencyReported
    && bundleVerificationReleaseSourceConsistencyReported
  );
  const sourceConsistencyPropagationPassed = directSourceConsistencyPropagationPassed || (
    mergeBundleReleaseSourceConsistencyPassed
    && bundleVerificationReleaseSourceConsistencyPassed
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
    mergeBundleInitialScopeReported,
    mergeBundleInitialScopePassed,
    mergeBundleReleaseSourceConsistencyReported,
    mergeBundleReleaseSourceConsistencyPassed,
    bundleVerificationReleaseReported,
    bundleVerificationReleasePassed,
    bundleVerificationInitialScopeReported,
    bundleVerificationInitialScopePassed,
    bundleVerificationReleaseSourceConsistencyReported,
    bundleVerificationReleaseSourceConsistencyPassed,
    validationPropagationReported,
    validationPropagationPassed,
    sourceConsistencyPropagationReported,
    sourceConsistencyPropagationPassed,
    propagationReported,
    propagationPassed,
  };
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
    }, options.timeoutMs ?? 300_000);
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
  const stage = normalizeStage(options.stage, "majority");
  const currentStage = normalizeStage(options.currentStage, "canary");
  const sourceHorizon = normalizeHorizon(options.horizon, "H2");
  const derivedNextHorizon = deriveNextHorizon(sourceHorizon);
  const nextHorizon = normalizeHorizon(options.nextHorizon, derivedNextHorizon || "H3");
  const evidenceSelectionMode = normalizeEvidenceSelectionMode(
    options.evidenceSelectionMode,
    "latest-passing",
  );

  const closeoutRunPrefix =
    sourceHorizon === "H2" ? "h2-closeout-run" : `horizon-closeout-run-${sourceHorizon}`;
  const outPath = path.resolve(
    options.out || path.join(evidenceDir, `${closeoutRunPrefix}-${stageStamp}.json`),
  );
  const calibrationOut = path.resolve(
    options.calibrationOut ||
      path.join(evidenceDir, `rollback-threshold-calibration-${stage}-${stageStamp}.json`),
  );
  const simulationOut = path.resolve(
    options.simulationOut || path.join(evidenceDir, `supervised-rollback-simulation-${stageStamp}.json`),
  );
  const closeoutOut = path.resolve(
    options.closeoutOut || path.join(evidenceDir, `horizon-closeout-${sourceHorizon}-${stageStamp}.json`),
  );

  const failures = [];
  if (!(await exists(evidenceDir))) {
    failures.push(`missing_evidence_dir:${evidenceDir}`);
  }
  if (!(await exists(horizonStatusFile))) {
    failures.push(`missing_horizon_status_file:${horizonStatusFile}`);
  }
  if (!(await exists(envFile))) {
    failures.push(`missing_env_file:${envFile}`);
  }
  if (isNonEmptyString(options.horizon) && sourceHorizon !== String(options.horizon).trim().toUpperCase()) {
    failures.push(`invalid_horizon:${String(options.horizon)}`);
  }
  if (!derivedNextHorizon) {
    failures.push(`horizon_has_no_next:${sourceHorizon}`);
  }
  if (derivedNextHorizon && nextHorizon !== derivedNextHorizon) {
    failures.push(`next_horizon_sequence_mismatch:${nextHorizon}!=${derivedNextHorizon}`);
  }
  if (isNonEmptyString(options.stage) && stage !== String(options.stage).trim().toLowerCase()) {
    failures.push(`invalid_stage:${String(options.stage)}`);
  }
  if (
    isNonEmptyString(options.currentStage) &&
    currentStage !== String(options.currentStage).trim().toLowerCase()
  ) {
    failures.push(`invalid_current_stage:${String(options.currentStage)}`);
  }
  if (
    isNonEmptyString(options.evidenceSelectionMode) &&
    String(options.evidenceSelectionMode).trim().toLowerCase() !== evidenceSelectionMode
  ) {
    failures.push(`invalid_evidence_selection_mode:${String(options.evidenceSelectionMode)}`);
  }

  let calibrationCommand = null;
  let simulationCommand = null;
  let closeoutCommand = null;
  let calibrationPayload = null;
  let simulationPayload = null;
  let closeoutPayload = null;
  let calibrationSchema = { valid: false, errors: ["calibration_not_loaded"] };
  let simulationSchema = { valid: false, errors: ["simulation_not_loaded"] };
  let closeoutSchema = { valid: false, errors: ["closeout_not_loaded"] };

  if (failures.length === 0) {
    const calibrationArgv = [
      "node",
      "scripts/calibrate-rollback-thresholds.mjs",
      "--stage",
      stage,
      "--evidence-dir",
      evidenceDir,
      "--out",
      calibrationOut,
      "--evidence-selection-mode",
      evidenceSelectionMode,
    ];
    calibrationCommand = await runCommand(calibrationArgv, { timeoutMs: options.timeoutMs });
    calibrationPayload = await readJsonMaybe(calibrationOut);
    calibrationSchema = validateManifestSchema(
      "rollback-threshold-calibration",
      calibrationPayload,
    );
    if (!calibrationSchema.valid) {
      failures.push(...calibrationSchema.errors.map((error) => `calibration_schema_invalid:${error}`));
    }
    if (calibrationCommand.code !== 0 || calibrationPayload?.pass !== true) {
      failures.push("calibration_step_failed");
    }

    const simulationArgv = [
      "node",
      "scripts/run-supervised-rollback-simulation.mjs",
      "--stage",
      stage,
      "--current-stage",
      currentStage,
      "--evidence-dir",
      evidenceDir,
      "--horizon-status-file",
      horizonStatusFile,
      "--env-file",
      envFile,
      "--calibration-file",
      calibrationOut,
      "--out",
      simulationOut,
      "--evidence-selection-mode",
      evidenceSelectionMode,
      "--timeout-ms",
      String(options.timeoutMs),
    ];
    if (options.allowHorizonMismatch) {
      simulationArgv.push("--allow-horizon-mismatch");
    }
    if (options.dryRun) {
      simulationArgv.push("--dry-run");
    }
    if (options.skipCutoverReadiness) {
      simulationArgv.push("--skip-cutover-readiness");
    }
    if (isNonEmptyString(options.canaryChats)) {
      simulationArgv.push("--canary-chats", options.canaryChats);
    }
    if (isNonEmptyString(options.majorityPercent)) {
      simulationArgv.push("--majority-percent", options.majorityPercent);
    }
    if (Number.isFinite(options.forceRollbackMinSuccessRate)) {
      simulationArgv.push(
        "--force-rollback-min-success-rate",
        String(options.forceRollbackMinSuccessRate),
      );
    }
    if (Number.isFinite(options.forceRollbackMaxP95LatencyMs)) {
      simulationArgv.push(
        "--force-rollback-max-p95-latency-ms",
        String(options.forceRollbackMaxP95LatencyMs),
      );
    }

    simulationCommand = await runCommand(simulationArgv, {
      timeoutMs: options.timeoutMs,
      env: {
        UNIFIED_RUNTIME_ENV_FILE: envFile,
      },
    });
    simulationPayload = await readJsonMaybe(simulationOut);
    simulationSchema = validateManifestSchema(
      "supervised-rollback-simulation",
      simulationPayload,
    );
    if (!simulationSchema.valid) {
      failures.push(...simulationSchema.errors.map((error) => `simulation_schema_invalid:${error}`));
    }
    const simulationStageSignals = resolveSimulationStageGoalPolicySignals(
      simulationPayload,
    );
    if (simulationCommand.code !== 0 || simulationPayload?.pass !== true) {
      failures.push("supervised_simulation_step_failed");
    }
    if (!simulationStageSignals.validationPropagationReported) {
      failures.push("supervised_simulation_stage_goal_policy_propagation_not_reported");
    } else if (!simulationStageSignals.sourceConsistencyPropagationReported) {
      failures.push("supervised_simulation_stage_goal_policy_source_consistency_not_reported");
    } else if (!simulationStageSignals.validationPropagationPassed) {
      failures.push("supervised_simulation_stage_goal_policy_propagation_not_passed");
    } else if (!simulationStageSignals.sourceConsistencyPropagationPassed) {
      failures.push("supervised_simulation_stage_goal_policy_source_consistency_not_passed");
    }

    const closeoutArgv = [
      "node",
      "scripts/validate-horizon-closeout.mjs",
      "--horizon",
      sourceHorizon,
      "--next-horizon",
      nextHorizon,
      "--evidence-dir",
      evidenceDir,
      "--horizon-status-file",
      horizonStatusFile,
      "--out",
      closeoutOut,
    ];
    if (options.requireCompletedActions) {
      closeoutArgv.push("--require-completed-actions");
    }
    if (options.requireActiveNextHorizon) {
      closeoutArgv.push("--require-active-next-horizon");
    }
    if (options.allowHorizonMismatch) {
      closeoutArgv.push("--allow-horizon-mismatch");
    }
    closeoutCommand = await runCommand(closeoutArgv, { timeoutMs: options.timeoutMs });
    closeoutPayload = await readJsonMaybe(closeoutOut);
    closeoutSchema = validateManifestSchema("horizon-closeout", closeoutPayload);
    if (!closeoutSchema.valid) {
      failures.push(...closeoutSchema.errors.map((error) => `closeout_schema_invalid:${error}`));
    }
    const closeoutSource = normalizeHorizon(
      closeoutPayload?.closeout?.horizon ?? closeoutPayload?.closeout?.sourceHorizon ?? "",
      "",
    );
    const closeoutNext = normalizeHorizon(
      closeoutPayload?.closeout?.nextHorizon ??
        closeoutPayload?.closeout?.targetNextHorizon ??
        closeoutPayload?.checks?.nextHorizon?.selectedNextHorizon ??
        "",
      "",
    );
    if (closeoutPayload && closeoutSource && closeoutSource !== sourceHorizon) {
      failures.push(`closeout_horizon_mismatch:${closeoutSource}!=${sourceHorizon}`);
    }
    if (closeoutPayload && closeoutNext && closeoutNext !== nextHorizon) {
      failures.push(`closeout_next_horizon_mismatch:${closeoutNext}!=${nextHorizon}`);
    }
    if (closeoutCommand.code !== 0 || closeoutPayload?.pass !== true) {
      appendCloseoutGateFailure(failures, sourceHorizon);
    }
  }

  const payload = {
    generatedAtIso: new Date().toISOString(),
    pass: failures.length === 0,
    stage,
    horizon: {
      source: sourceHorizon,
      next: nextHorizon,
    },
    dryRun: options.dryRun,
    files: {
      evidenceDir,
      horizonStatusFile,
      envFile,
      outPath,
      calibrationOut,
      simulationOut,
      closeoutOut,
    },
    checks: {
      evidenceSelectionMode,
      calibrationPass: calibrationPayload?.pass === true,
      calibrationSchemaValid: calibrationSchema.valid,
      calibrationSchemaErrors:
        calibrationSchema.valid || calibrationSchema.errors.length === 0
          ? null
          : calibrationSchema.errors,
      supervisedSimulationPass: simulationPayload?.pass === true,
      supervisedSimulationSchemaValid: simulationSchema.valid,
      supervisedSimulationSchemaErrors:
        simulationSchema.valid || simulationSchema.errors.length === 0
          ? null
          : simulationSchema.errors,
      supervisedSimulationStageGoalPolicyPropagationReported:
        resolveSimulationStageGoalPolicySignals(simulationPayload).propagationReported,
      supervisedSimulationStageGoalPolicyPropagationPassed:
        resolveSimulationStageGoalPolicySignals(simulationPayload).propagationPassed,
      supervisedSimulationStageGoalPolicyValidationPropagationReported:
        resolveSimulationStageGoalPolicySignals(simulationPayload).validationPropagationReported,
      supervisedSimulationStageGoalPolicyValidationPropagationPassed:
        resolveSimulationStageGoalPolicySignals(simulationPayload).validationPropagationPassed,
      supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported:
        resolveSimulationStageGoalPolicySignals(simulationPayload).sourceConsistencyPropagationReported,
      supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed:
        resolveSimulationStageGoalPolicySignals(simulationPayload).sourceConsistencyPropagationPassed,
      supervisedSimulationStagePolicySignalsPass:
        resolveSimulationStageGoalPolicySignals(simulationPayload).propagationPassed,
      supervisedSimulationStageSourceConsistencySignalsPass:
        resolveSimulationStageGoalPolicySignals(simulationPayload).sourceConsistencyPropagationPassed,
      supervisedSimulationStageMergeBundleGoalPolicySourceConsistencyReported:
        resolveSimulationStageGoalPolicySignals(simulationPayload)
          .mergeBundleReleaseSourceConsistencyReported,
      supervisedSimulationStageMergeBundleGoalPolicySourceConsistencyPassed:
        resolveSimulationStageGoalPolicySignals(simulationPayload)
          .mergeBundleReleaseSourceConsistencyPassed,
      supervisedSimulationStageBundleVerificationGoalPolicySourceConsistencyReported:
        resolveSimulationStageGoalPolicySignals(simulationPayload)
          .bundleVerificationReleaseSourceConsistencyReported,
      supervisedSimulationStageBundleVerificationGoalPolicySourceConsistencyPassed:
        resolveSimulationStageGoalPolicySignals(simulationPayload)
          .bundleVerificationReleaseSourceConsistencyPassed,
      horizonCloseoutGatePass: closeoutPayload?.pass === true,
      horizonCloseoutSchemaValid: closeoutSchema.valid,
      horizonCloseoutSchemaErrors:
        closeoutSchema.valid || closeoutSchema.errors.length === 0
          ? null
          : closeoutSchema.errors,
      h2CloseoutGatePass: closeoutPayload?.pass === true,
      rollbackTriggered: simulationPayload?.checks?.rollbackTriggered === true,
      rollbackApplied: simulationPayload?.checks?.rollbackApplied === true,
      shadowRestored: simulationPayload?.checks?.shadowRestored === true,
      requireCompletedActions: options.requireCompletedActions,
      requireActiveNextHorizon: options.requireActiveNextHorizon,
      sourceHorizon,
      nextHorizon,
    },
    commands: {
      calibration: calibrationCommand,
      supervisedSimulation: simulationCommand,
      horizonCloseout: closeoutCommand,
      h2Closeout: closeoutCommand,
    },
    failures,
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (!payload.pass) {
    process.stderr.write(
      `Horizon closeout run failed (${sourceHorizon}->${nextHorizon}):\n- ${failures.join("\n- ")}\n`,
    );
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
