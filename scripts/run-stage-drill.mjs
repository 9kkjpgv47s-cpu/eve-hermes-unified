#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const VALID_STAGES = ["shadow", "canary", "majority", "full"];

function parseArgs(argv) {
  const options = {
    stage: "",
    currentStage: "",
    evidenceDir: "",
    horizonStatusFile: "",
    envFile: "",
    runtimeEnvFile: "",
    out: "",
    promoteOut: "",
    readinessOut: "",
    rollbackPolicyOut: "",
    canaryChats: "",
    majorityPercent: "",
    timeoutMs: 180_000,
    dryRun: false,
    allowHorizonMismatch: false,
    autoApplyRollback: false,
    rollbackMinSuccessRate: Number.NaN,
    rollbackMaxMissingTraceRate: Number.NaN,
    rollbackMaxUnclassifiedFailures: Number.NaN,
    rollbackMinFailureScenarioPassCount: Number.NaN,
    rollbackMaxP95LatencyMs: Number.NaN,
    evidenceSelectionMode: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--stage" || arg === "--target-stage") {
      options.stage = value ?? "";
      index += 1;
    } else if (arg === "--current-stage") {
      options.currentStage = value ?? "";
      index += 1;
    } else if (arg === "--evidence-dir") {
      options.evidenceDir = value ?? "";
      index += 1;
    } else if (arg === "--horizon-status-file") {
      options.horizonStatusFile = value ?? "";
      index += 1;
    } else if (arg === "--runtime-env-file") {
      options.runtimeEnvFile = value ?? "";
      index += 1;
    } else if (arg === "--env-file") {
      options.envFile = value ?? "";
      index += 1;
    } else if (arg === "--out") {
      options.out = value ?? "";
      index += 1;
    } else if (arg === "--promote-out") {
      options.promoteOut = value ?? "";
      index += 1;
    } else if (arg === "--readiness-out") {
      options.readinessOut = value ?? "";
      index += 1;
    } else if (arg === "--rollback-policy-out") {
      options.rollbackPolicyOut = value ?? "";
      index += 1;
    } else if (arg === "--canary-chats") {
      options.canaryChats = value ?? "";
      index += 1;
    } else if (arg === "--majority-percent") {
      options.majorityPercent = value ?? "";
      index += 1;
    } else if (arg === "--timeout-ms") {
      options.timeoutMs = Number(value ?? "180000");
      index += 1;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--allow-horizon-mismatch" || arg === "--ignore-horizon-target") {
      options.allowHorizonMismatch = true;
    } else if (arg === "--auto-apply-rollback") {
      options.autoApplyRollback = true;
    } else if (arg === "--rollback-min-success-rate") {
      options.rollbackMinSuccessRate = Number(value ?? "");
      index += 1;
    } else if (arg === "--rollback-max-missing-trace-rate") {
      options.rollbackMaxMissingTraceRate = Number(value ?? "");
      index += 1;
    } else if (arg === "--rollback-max-unclassified-failures") {
      options.rollbackMaxUnclassifiedFailures = Number(value ?? "");
      index += 1;
    } else if (arg === "--rollback-min-failure-scenario-pass-count") {
      options.rollbackMinFailureScenarioPassCount = Number(value ?? "");
      index += 1;
    } else if (arg === "--rollback-max-p95-latency-ms") {
      options.rollbackMaxP95LatencyMs = Number(value ?? "");
      index += 1;
    } else if (arg === "--evidence-selection-mode") {
      options.evidenceSelectionMode = value ?? "";
      index += 1;
    }
  }
  return options;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeStage(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return VALID_STAGES.includes(normalized) ? normalized : "";
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

function maybePushFileArg(argv, flag, filePath) {
  if (isNonEmptyString(filePath)) {
    argv.push(flag, filePath);
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
    }, options?.timeoutMs ?? 180_000);
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
  const targetStage = normalizeStage(options.stage);
  const evidenceDir = path.resolve(options.evidenceDir || path.join(process.cwd(), "evidence"));
  const horizonStatusFile = path.resolve(
    options.horizonStatusFile || path.join(process.cwd(), "docs/HORIZON_STATUS.json"),
  );
  const envFile = path.resolve(
    options.runtimeEnvFile ||
      options.envFile ||
      process.env.UNIFIED_RUNTIME_ENV_FILE ||
      path.join(process.env.HOME || "", ".openclaw/run/gateway.env"),
  );
  const stageStamp = stamp();
  const outPath = path.resolve(
    options.out || path.join(evidenceDir, `stage-drill-${targetStage || "unknown"}-${stageStamp}.json`),
  );
  const promoteOut = path.resolve(
    options.promoteOut || path.join(evidenceDir, `stage-promotion-execution-${stageStamp}.json`),
  );
  const readinessOut = path.resolve(
    options.readinessOut || path.join(evidenceDir, `stage-promotion-readiness-${stageStamp}.json`),
  );
  const rollbackPolicyOut = path.resolve(
    options.rollbackPolicyOut || path.join(evidenceDir, `auto-rollback-policy-${stageStamp}.json`),
  );

  const failures = [];
  if (!targetStage) {
    failures.push(`invalid_target_stage:${options.stage || "<empty>"}`);
  }

  const promoteArgs = [
    "node",
    "scripts/promote-cutover-stage.mjs",
    "--target-stage",
    targetStage || options.stage,
    "--evidence-dir",
    evidenceDir,
    "--horizon-status-file",
    horizonStatusFile,
    "--out",
    promoteOut,
    "--readiness-out",
    readinessOut,
  ];
  if (isNonEmptyString(options.currentStage)) {
    promoteArgs.push("--current-stage", options.currentStage);
  }
  if (isNonEmptyString(options.canaryChats)) {
    promoteArgs.push("--canary-chats", options.canaryChats);
  }
  if (isNonEmptyString(options.majorityPercent)) {
    promoteArgs.push("--majority-percent", options.majorityPercent);
  }
  if (options.dryRun) {
    promoteArgs.push("--dry-run");
  }
  if (options.allowHorizonMismatch) {
    promoteArgs.push("--allow-horizon-mismatch");
  }
  if (isNonEmptyString(options.evidenceSelectionMode)) {
    promoteArgs.push("--evidence-selection-mode", options.evidenceSelectionMode);
  }
  if (Number.isFinite(options.timeoutMs)) {
    promoteArgs.push("--timeout-ms", String(options.timeoutMs));
  }

  const promoteCommand = await runCommand(promoteArgs, {
    timeoutMs: Number.isFinite(options.timeoutMs) ? options.timeoutMs : 180_000,
    env: {
      UNIFIED_RUNTIME_ENV_FILE: envFile,
    },
  });
  const promotePayload = await readJsonMaybe(promoteOut);
  const readinessPayload = await readJsonMaybe(readinessOut);
  const promotePassed = promoteCommand.code === 0 && promotePayload?.pass === true;
  if (!promotePassed) {
    failures.push("stage_promotion_step_failed");
  }

  const promotionEvidenceFiles = {
    validationSummary: String(
      readinessPayload?.files?.validationSummary ??
        promotePayload?.files?.validationSummary ??
        "",
    ),
    cutoverReadiness: String(
      readinessPayload?.files?.cutoverReadiness ??
        promotePayload?.files?.cutoverReadiness ??
        "",
    ),
    releaseReadiness: String(
      readinessPayload?.files?.releaseReadiness ??
        promotePayload?.files?.releaseReadiness ??
        "",
    ),
    stagePromotionReadiness: String(readinessOut),
  };

  const rollbackPolicyArgs = [
    "node",
    "scripts/evaluate-auto-rollback-policy.mjs",
    "--stage",
    targetStage || options.stage,
    "--evidence-dir",
    evidenceDir,
    "--horizon-status-file",
    horizonStatusFile,
    "--out",
    rollbackPolicyOut,
  ];
  maybePushFileArg(
    rollbackPolicyArgs,
    "--validation-summary-file",
    promotionEvidenceFiles.validationSummary,
  );
  maybePushFileArg(
    rollbackPolicyArgs,
    "--cutover-readiness-file",
    promotionEvidenceFiles.cutoverReadiness,
  );
  maybePushFileArg(
    rollbackPolicyArgs,
    "--release-readiness-file",
    promotionEvidenceFiles.releaseReadiness,
  );
  maybePushFileArg(
    rollbackPolicyArgs,
    "--stage-promotion-readiness-file",
    promotionEvidenceFiles.stagePromotionReadiness,
  );
  if (isNonEmptyString(options.evidenceSelectionMode)) {
    rollbackPolicyArgs.push("--evidence-selection-mode", options.evidenceSelectionMode);
  }
  if (options.autoApplyRollback) {
    rollbackPolicyArgs.push("--auto-apply-rollback");
  }
  if (Number.isFinite(options.rollbackMinSuccessRate)) {
    rollbackPolicyArgs.push("--min-success-rate", String(options.rollbackMinSuccessRate));
  }
  if (Number.isFinite(options.rollbackMaxMissingTraceRate)) {
    rollbackPolicyArgs.push("--max-missing-trace-rate", String(options.rollbackMaxMissingTraceRate));
  }
  if (Number.isFinite(options.rollbackMaxUnclassifiedFailures)) {
    rollbackPolicyArgs.push(
      "--max-unclassified-failures",
      String(options.rollbackMaxUnclassifiedFailures),
    );
  }
  if (Number.isFinite(options.rollbackMinFailureScenarioPassCount)) {
    rollbackPolicyArgs.push(
      "--min-failure-scenario-pass-count",
      String(options.rollbackMinFailureScenarioPassCount),
    );
  }
  if (Number.isFinite(options.rollbackMaxP95LatencyMs)) {
    rollbackPolicyArgs.push("--max-p95-latency-ms", String(options.rollbackMaxP95LatencyMs));
  }

  const rollbackPolicyCommand = await runCommand(rollbackPolicyArgs, {
    timeoutMs: Number.isFinite(options.timeoutMs) ? options.timeoutMs : 180_000,
    env: {
      UNIFIED_RUNTIME_ENV_FILE: envFile,
    },
  });
  const rollbackPolicyPayload = await readJsonMaybe(rollbackPolicyOut);
  const rollbackAction = String(rollbackPolicyPayload?.decision?.action ?? "");
  const rollbackPolicyPassed =
    rollbackPolicyCommand.code === 0 &&
    rollbackPolicyPayload?.pass === true &&
    rollbackAction === "hold";
  const rollbackEvaluationReadable =
    rollbackPolicyCommand.code === 0 || rollbackPolicyCommand.code === 2;
  if (!rollbackEvaluationReadable) {
    failures.push("auto_rollback_policy_step_failed");
  }
  if (!rollbackPolicyPayload) {
    failures.push("auto_rollback_policy_output_missing");
  } else if (rollbackAction === "rollback") {
    failures.push("rollback_policy_triggered");
  }

  const payload = {
    generatedAtIso: new Date().toISOString(),
    pass: failures.length === 0,
    dryRun: options.dryRun,
    stage: targetStage || null,
    decision: {
      action: rollbackAction || null,
      shouldRollback: rollbackAction === "rollback",
      rollbackApplied: rollbackPolicyPayload?.decision?.rollbackApplied === true,
    },
    files: {
      evidenceDir,
      horizonStatusFile: (await exists(horizonStatusFile)) ? horizonStatusFile : null,
      envFile: (await exists(envFile)) ? envFile : null,
      outPath,
      promoteOut,
      readinessOut,
      rollbackPolicyOut,
    },
    checks: {
      promotionPassed: promotePassed,
      rollbackPolicyEvaluated: rollbackEvaluationReadable,
      rollbackPolicyPassed,
      rollbackPolicyAction: rollbackAction || null,
      rollbackApplied: rollbackPolicyPayload?.decision?.rollbackApplied === true,
      autoApplyRollbackRequested: options.autoApplyRollback,
      dryRun: options.dryRun,
      allowHorizonMismatch: options.allowHorizonMismatch,
      evidenceSnapshotPinned: [
        promotionEvidenceFiles.validationSummary,
        promotionEvidenceFiles.cutoverReadiness,
        promotionEvidenceFiles.releaseReadiness,
        promotionEvidenceFiles.stagePromotionReadiness,
      ].every((filePath) => isNonEmptyString(filePath)),
    },
    commands: {
      promote: promoteCommand,
      rollbackPolicy: rollbackPolicyCommand,
    },
    failures,
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (!payload.pass) {
    process.stderr.write(`Stage drill failed:\n- ${failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
