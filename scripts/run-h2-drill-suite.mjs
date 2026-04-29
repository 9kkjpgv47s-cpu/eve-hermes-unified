#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const VALID_STAGES = ["shadow", "canary", "majority", "full"];

function parseArgs(argv) {
  const options = {
    evidenceDir: "",
    horizonStatusFile: "",
    runtimeEnvFile: "",
    out: "",
    timeoutMs: 240_000,
    dryRun: false,
    canaryStage: "canary",
    majorityStage: "majority",
    rollbackSimulationStage: "majority",
    canaryChats: "",
    majorityPercent: "",
    skipMajority: false,
    skipRollbackSimulation: false,
    allowHorizonMismatch: false,
    strictHorizonTarget: false,
    autoApplyRollback: false,
    rollbackForceMinSuccessRate: 0.99,
    rollbackForceMaxP95LatencyMs: Number.NaN,
    evidenceSelectionMode: "latest",
    /** When true (default), majority dry-run omits `--current-stage` so env-derived current + drill auto-relax can apply. */
    majorityDryRunInferCurrentFromEnv: true,
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
    } else if (arg === "--runtime-env-file" || arg === "--env-file") {
      options.runtimeEnvFile = value ?? "";
      index += 1;
    } else if (arg === "--out") {
      options.out = value ?? "";
      index += 1;
    } else if (arg === "--timeout-ms") {
      options.timeoutMs = Number(value ?? "240000");
      index += 1;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--canary-stage") {
      options.canaryStage = value ?? "";
      index += 1;
    } else if (arg === "--majority-stage") {
      options.majorityStage = value ?? "";
      index += 1;
    } else if (arg === "--rollback-simulation-stage") {
      options.rollbackSimulationStage = value ?? "";
      index += 1;
    } else if (arg === "--canary-chats") {
      options.canaryChats = value ?? "";
      index += 1;
    } else if (arg === "--majority-percent") {
      options.majorityPercent = value ?? "";
      index += 1;
    } else if (arg === "--skip-majority") {
      options.skipMajority = true;
    } else if (arg === "--skip-rollback-simulation") {
      options.skipRollbackSimulation = true;
    } else if (arg === "--allow-horizon-mismatch") {
      options.allowHorizonMismatch = true;
    } else if (arg === "--strict-horizon-target") {
      options.strictHorizonTarget = true;
    } else if (arg === "--auto-apply-rollback") {
      options.autoApplyRollback = true;
    } else if (arg === "--rollback-force-min-success-rate") {
      options.rollbackForceMinSuccessRate = Number(value ?? "0.99");
      index += 1;
    } else if (arg === "--rollback-trigger-min-success-rate") {
      options.rollbackForceMinSuccessRate = Number(value ?? "0.99");
      index += 1;
    } else if (arg === "--rollback-force-max-p95-latency-ms") {
      options.rollbackForceMaxP95LatencyMs = Number(value ?? "");
      index += 1;
    } else if (arg === "--rollback-trigger-max-p95-latency-ms") {
      options.rollbackForceMaxP95LatencyMs = Number(value ?? "");
      index += 1;
    } else if (arg === "--evidence-selection-mode") {
      options.evidenceSelectionMode = value ?? "";
      index += 1;
    } else if (arg === "--no-majority-dry-run-env-current") {
      options.majorityDryRunInferCurrentFromEnv = false;
    }
  }
  return options;
}

function normalizeEvidenceSelectionMode(value, fallback = "latest") {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "latest" || normalized === "latest-passing" ? normalized : fallback;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeStage(value, fallback = "") {
  const normalized = String(value ?? "").trim().toLowerCase();
  return VALID_STAGES.includes(normalized) ? normalized : fallback;
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

async function runCommand(argv, options) {
  const startedAtMs = Date.now();
  return await new Promise((resolve) => {
    const [command, ...args] = argv;
    const child = spawn(command, args, {
      env: { ...process.env, ...(options?.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options?.timeoutMs ?? 240_000);
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

function shouldAllowHorizonMismatch(options, stage) {
  return (
    options.allowHorizonMismatch === true ||
    (options.strictHorizonTarget !== true && stage !== "canary")
  );
}

async function runDrillStep({
  name,
  stage,
  currentStage,
  options,
  evidenceDir,
  horizonStatusFile,
  runtimeEnvFile,
  suiteStamp,
  extraArgs,
}) {
  const outPath = path.resolve(evidenceDir, `${name}-stage-drill-${suiteStamp}.json`);
  const argv = [
    "node",
    "scripts/run-stage-drill.mjs",
    "--target-stage",
    stage,
    "--evidence-dir",
    evidenceDir,
    "--horizon-status-file",
    horizonStatusFile,
    "--out",
    outPath,
    "--timeout-ms",
    String(options.timeoutMs),
  ];
  if (isNonEmptyString(currentStage)) {
    argv.push("--current-stage", currentStage);
  }
  if (isNonEmptyString(runtimeEnvFile)) {
    argv.push("--runtime-env-file", runtimeEnvFile);
  }
  if (options.dryRun) {
    argv.push("--dry-run");
  }
  if (stage === "canary" && isNonEmptyString(options.canaryChats)) {
    argv.push("--canary-chats", options.canaryChats);
  }
  if (stage === "majority" && isNonEmptyString(options.majorityPercent)) {
    argv.push("--majority-percent", options.majorityPercent);
  }
  if (shouldAllowHorizonMismatch(options, stage)) {
    argv.push("--allow-horizon-mismatch");
  }
  if (isNonEmptyString(options.evidenceSelectionMode)) {
    argv.push("--evidence-selection-mode", options.evidenceSelectionMode);
  }
  for (const value of extraArgs) {
    argv.push(value);
  }

  const command = await runCommand(argv, {
    timeoutMs: options.timeoutMs,
    env: isNonEmptyString(runtimeEnvFile)
      ? { UNIFIED_RUNTIME_ENV_FILE: runtimeEnvFile }
      : undefined,
  });
  const forcedPayloadEnvKey = `UNIFIED_FORCE_${String(name).trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_DRILL_PAYLOAD_PATH`;
  const forcedPayloadPathRaw = process.env[forcedPayloadEnvKey];
  const forcedPayloadPath =
    isNonEmptyString(forcedPayloadPathRaw)
      ? (path.isAbsolute(forcedPayloadPathRaw)
          ? path.resolve(forcedPayloadPathRaw)
          : path.resolve(evidenceDir, forcedPayloadPathRaw))
      : "";
  const payload = await readJsonMaybe(isNonEmptyString(forcedPayloadPath) ? forcedPayloadPath : outPath);
  return {
    name,
    stage,
    outPath,
    forcedPayloadPath: isNonEmptyString(forcedPayloadPath) ? forcedPayloadPath : null,
    command,
    payload,
  };
}

function isHoldStepPassing(step) {
  const sourceConsistencySignals = resolveStepSourceConsistencySignals(step.payload);
  return (
    step.command.code === 0 &&
    step.payload?.pass === true &&
    step.payload?.decision?.action === "hold" &&
    step.payload?.checks?.promotionPassed === true &&
    step.payload?.checks?.rollbackPolicyPassed === true &&
    step.payload?.checks?.rollbackPolicyStageSignalsPass === true &&
    sourceConsistencySignals.propagationReported === true &&
    sourceConsistencySignals.propagationPassed === true
  );
}

function isRollbackSimulationPassing(step, autoApplyRollback) {
  const sourceConsistencySignals = resolveStepSourceConsistencySignals(step.payload);
  if (!step.payload || step.payload.decision?.action !== "rollback") {
    return false;
  }
  if (step.payload?.checks?.promotionPassed !== true) {
    return false;
  }
  if (step.payload?.checks?.rollbackPolicyEvaluated !== true) {
    return false;
  }
  if (step.payload?.checks?.rollbackPolicyStageSignalsPass !== true) {
    return false;
  }
  if (!sourceConsistencySignals.propagationReported || !sourceConsistencySignals.propagationPassed) {
    return false;
  }
  if (autoApplyRollback && step.payload?.decision?.rollbackApplied !== true) {
    return false;
  }
  return true;
}

function resolveStepSourceConsistencySignals(stepPayload) {
  const checks =
    stepPayload?.checks && typeof stepPayload.checks === "object"
      ? stepPayload.checks
      : {};
  const mergeBundleReported =
    checks.rollbackStagePromotionMergeBundleGoalPolicySourceConsistencyReported === true;
  const mergeBundlePassed =
    checks.rollbackStagePromotionMergeBundleGoalPolicySourceConsistencyPassed === true;
  const bundleVerificationReported =
    checks.rollbackStagePromotionBundleVerificationGoalPolicySourceConsistencyReported === true;
  const bundleVerificationPassed =
    checks.rollbackStagePromotionBundleVerificationGoalPolicySourceConsistencyPassed === true;
  const propagationReported =
    checks.rollbackStagePromotionGoalPolicySourceConsistencyPropagationReported === true
    || (mergeBundleReported && bundleVerificationReported);
  const propagationPassed =
    checks.rollbackStagePromotionGoalPolicySourceConsistencyPropagationPassed === true
    || (mergeBundlePassed && bundleVerificationPassed);
  return {
    mergeBundleReported,
    mergeBundlePassed,
    bundleVerificationReported,
    bundleVerificationPassed,
    propagationReported,
    propagationPassed,
  };
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const evidenceSelectionMode = normalizeEvidenceSelectionMode(options.evidenceSelectionMode, "latest");
  const evidenceDir = path.resolve(options.evidenceDir || path.join(process.cwd(), "evidence"));
  const horizonStatusFile = path.resolve(
    options.horizonStatusFile || path.join(process.cwd(), "docs/HORIZON_STATUS.json"),
  );
  const runtimeEnvFile = isNonEmptyString(options.runtimeEnvFile)
    ? path.resolve(options.runtimeEnvFile)
    : "";
  const canaryStage = normalizeStage(options.canaryStage, "canary");
  const majorityStage = normalizeStage(options.majorityStage, "majority");
  const rollbackSimulationStage = normalizeStage(
    options.rollbackSimulationStage,
    majorityStage,
  );
  const suiteStamp = stamp();
  const outPath = path.resolve(
    options.out || path.join(evidenceDir, `h2-drill-suite-${suiteStamp}.json`),
  );

  const failures = [];
  if (!VALID_STAGES.includes(canaryStage)) {
    failures.push(`invalid_canary_stage:${options.canaryStage}`);
  }
  if (!options.skipMajority && !VALID_STAGES.includes(majorityStage)) {
    failures.push(`invalid_majority_stage:${options.majorityStage}`);
  }
  if (!options.skipRollbackSimulation && !VALID_STAGES.includes(rollbackSimulationStage)) {
    failures.push(`invalid_rollback_simulation_stage:${options.rollbackSimulationStage}`);
  }
  if (!Number.isFinite(options.rollbackForceMinSuccessRate)) {
    failures.push("invalid_rollback_force_min_success_rate");
  }
  if (
    String(options.evidenceSelectionMode ?? "").trim().length > 0 &&
    evidenceSelectionMode !== "latest" &&
    evidenceSelectionMode !== "latest-passing"
  ) {
    failures.push(
      `invalid_evidence_selection_mode:${String(options.evidenceSelectionMode ?? "<empty>")}`,
    );
  }

  options.evidenceSelectionMode = evidenceSelectionMode;

  const steps = {
    canary: null,
    majority: null,
    rollbackSimulation: null,
  };

  if (VALID_STAGES.includes(canaryStage)) {
    steps.canary = await runDrillStep({
      name: "canary",
      stage: canaryStage,
      currentStage: "shadow",
      options,
      evidenceDir,
      horizonStatusFile,
      runtimeEnvFile,
      suiteStamp,
      extraArgs: [],
    });
  }
  if (!options.skipMajority && VALID_STAGES.includes(majorityStage)) {
    const majorityCurrentStage =
      options.dryRun === true && options.majorityDryRunInferCurrentFromEnv
        ? ""
        : steps.canary
          ? canaryStage
          : "shadow";
    steps.majority = await runDrillStep({
      name: "majority",
      stage: majorityStage,
      currentStage: majorityCurrentStage,
      options,
      evidenceDir,
      horizonStatusFile,
      runtimeEnvFile,
      suiteStamp,
      extraArgs: [],
    });
  }
  if (!options.skipRollbackSimulation && VALID_STAGES.includes(rollbackSimulationStage)) {
    const rollbackSimulationCurrentStage = steps.majority
      ? majorityStage
      : steps.canary
        ? canaryStage
        : "shadow";
    const rollbackSimMinSuccessRate = Math.max(options.rollbackForceMinSuccessRate, 1.001);
    const rollbackExtraArgs = [
      "--rollback-min-success-rate",
      String(rollbackSimMinSuccessRate),
      "--relax-stage-transition",
      "--expect-rollback-decision",
    ];
    if (Number.isFinite(options.rollbackForceMaxP95LatencyMs)) {
      rollbackExtraArgs.push(
        "--max-p95-latency-ms",
        String(options.rollbackForceMaxP95LatencyMs),
      );
    }
    if (options.autoApplyRollback) {
      rollbackExtraArgs.push("--auto-apply-rollback");
    }
    steps.rollbackSimulation = await runDrillStep({
      name: "rollback-sim",
      stage: rollbackSimulationStage,
      currentStage: rollbackSimulationCurrentStage,
      options,
      evidenceDir,
      horizonStatusFile,
      runtimeEnvFile,
      suiteStamp,
      extraArgs: rollbackExtraArgs,
    });
  }

  const canaryHoldPass = steps.canary ? isHoldStepPassing(steps.canary) : false;
  const majorityHoldPass =
    options.skipMajority || !steps.majority
      ? null
      : isHoldStepPassing(steps.majority);
  const rollbackSimulationTriggered =
    options.skipRollbackSimulation || !steps.rollbackSimulation
      ? null
      : steps.rollbackSimulation.payload?.decision?.action === "rollback";
  const rollbackSimulationPass =
    options.skipRollbackSimulation || !steps.rollbackSimulation
      ? null
      : isRollbackSimulationPassing(steps.rollbackSimulation, options.autoApplyRollback);

  const forceMalformedCanaryStageDrill = parseBooleanEnv(
    process.env.UNIFIED_FORCE_MALFORMED_CANARY_STAGE_DRILL,
    false,
  );
  const effectiveCanaryHoldPass = forceMalformedCanaryStageDrill ? false : canaryHoldPass;

  if (!effectiveCanaryHoldPass) {
    failures.push("canary_drill_failed");
  }
  if (majorityHoldPass === false) {
    failures.push("majority_drill_failed");
  }
  if (rollbackSimulationTriggered === false) {
    failures.push("rollback_simulation_not_triggered");
  }
  if (rollbackSimulationPass === false) {
    failures.push("rollback_simulation_failed");
  }

  const payload = {
    generatedAtIso: new Date().toISOString(),
    pass: failures.length === 0,
    files: {
      evidenceDir,
      horizonStatusFile: (await exists(horizonStatusFile)) ? horizonStatusFile : null,
      runtimeEnvFile: isNonEmptyString(runtimeEnvFile) && (await exists(runtimeEnvFile))
        ? runtimeEnvFile
        : null,
      outPath,
      canaryOutPath: steps.canary?.outPath ?? null,
      canaryForcedPayloadPath: steps.canary?.forcedPayloadPath ?? null,
      majorityOutPath: steps.majority?.outPath ?? null,
      majorityForcedPayloadPath: steps.majority?.forcedPayloadPath ?? null,
      rollbackSimulationOutPath: steps.rollbackSimulation?.outPath ?? null,
      rollbackSimulationForcedPayloadPath: steps.rollbackSimulation?.forcedPayloadPath ?? null,
    },
    suite: {
      dryRun: options.dryRun,
      allowHorizonMismatch: options.allowHorizonMismatch,
      strictHorizonTarget: options.strictHorizonTarget,
      timeoutMs: options.timeoutMs,
      stages: {
        canary: canaryStage,
        majority: options.skipMajority ? null : majorityStage,
        rollbackSimulation: options.skipRollbackSimulation ? null : rollbackSimulationStage,
      },
      rollbackSimulation: {
        skipped: options.skipRollbackSimulation,
        autoApplyRollback: options.autoApplyRollback,
        forceMinSuccessRate: options.rollbackForceMinSuccessRate,
      },
      evidenceSelectionMode: options.evidenceSelectionMode,
      majorityDryRunInferCurrentFromEnv: options.majorityDryRunInferCurrentFromEnv,
    },
    checks: {
      canaryHoldPass,
      canaryHoldPassRaw: canaryHoldPass,
      canaryHoldPassForced: effectiveCanaryHoldPass,
      majorityHoldPass,
      rollbackSimulationTriggered,
      rollbackSimulationPass,
      canaryPassed: canaryHoldPass,
      majorityPassed: majorityHoldPass,
      rollbackSimulationEvaluated:
        options.skipRollbackSimulation || !steps.rollbackSimulation
          ? false
          : true,
      rollbackPolicyStageSignalsPass:
        steps.canary?.payload?.checks?.rollbackPolicyStageSignalsPass === true &&
        (options.skipMajority || steps.majority?.payload?.checks?.rollbackPolicyStageSignalsPass === true) &&
        (options.skipRollbackSimulation ||
          steps.rollbackSimulation?.payload?.checks?.rollbackPolicyStageSignalsPass === true),
      rollbackPolicySourceConsistencySignalsReported:
        resolveStepSourceConsistencySignals(steps.canary?.payload).propagationReported &&
        (options.skipMajority ||
          resolveStepSourceConsistencySignals(steps.majority?.payload).propagationReported) &&
        (options.skipRollbackSimulation ||
          resolveStepSourceConsistencySignals(steps.rollbackSimulation?.payload).propagationReported),
      rollbackPolicySourceConsistencySignalsPass:
        resolveStepSourceConsistencySignals(steps.canary?.payload).propagationPassed &&
        (options.skipMajority ||
          resolveStepSourceConsistencySignals(steps.majority?.payload).propagationPassed) &&
        (options.skipRollbackSimulation ||
          resolveStepSourceConsistencySignals(steps.rollbackSimulation?.payload).propagationPassed),
    },
    steps: {
      canary: steps.canary,
      majority: steps.majority,
      rollbackSimulation: steps.rollbackSimulation,
    },
    failures,
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (!payload.pass) {
    process.stderr.write(`H2 drill suite failed:\n- ${failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
