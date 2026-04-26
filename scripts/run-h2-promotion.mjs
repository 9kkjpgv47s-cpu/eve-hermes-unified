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
    nextHorizon: "H3",
    canaryChats: "",
    majorityPercent: "",
    timeoutMs: 360_000,
    evidenceSelectionMode: "latest-passing",
    dryRun: false,
    allowHorizonMismatch: false,
    skipCutoverReadiness: false,
    note: "",
    closeoutRunOut: "",
    horizonPromotionOut: "",
    forceRollbackMinSuccessRate: Number.NaN,
    forceRollbackMaxP95LatencyMs: Number.NaN,
    requireActiveNextHorizon: false,
    requireCompletedActions: true,
    allowInactiveSourceHorizon: false,
    requireProgressiveGoals: false,
    minimumGoalIncrease: 1,
    goalPolicyKey: "",
    goalPolicyFile: "",
    strictGoalPolicyGates: false,
    requireGoalPolicyCoverage: false,
    goalPolicyCoverageOut: "",
    goalPolicyCoverageUntilHorizon: "H5",
    goalPolicyCoverageUntilExplicit: false,
    requiredPolicyTransitions: "",
    requirePolicyTaggedTargets: false,
    requirePositivePendingPolicyMin: false,
    requireGoalPolicyReadinessAudit: false,
    goalPolicyReadinessAuditOut: "",
    goalPolicyReadinessAuditUntilHorizon: "H5",
    goalPolicyReadinessAuditUntilExplicit: false,
    requireGoalPolicyReadinessTaggedTargets: false,
    requireGoalPolicyReadinessPositivePendingMin: false,
    progressiveGoalsOut: "",
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
      options.timeoutMs = Number(value ?? "360000");
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
    } else if (arg === "--note") {
      options.note = value ?? "";
      index += 1;
    } else if (arg === "--closeout-run-out") {
      options.closeoutRunOut = value ?? "";
      index += 1;
    } else if (arg === "--horizon-promotion-out") {
      options.horizonPromotionOut = value ?? "";
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
    } else if (arg === "--allow-inactive-source-horizon") {
      options.allowInactiveSourceHorizon = true;
    } else if (arg === "--require-progressive-goals") {
      options.requireProgressiveGoals = true;
    } else if (arg === "--minimum-goal-increase") {
      options.minimumGoalIncrease = Number(value ?? "1");
      index += 1;
    } else if (arg === "--goal-policy-key") {
      options.goalPolicyKey = value ?? "";
      index += 1;
    } else if (arg === "--goal-policy-file") {
      options.goalPolicyFile = value ?? "";
      index += 1;
    } else if (arg === "--strict-goal-policy-gates" || arg === "--require-strict-goal-policy-gates") {
      options.strictGoalPolicyGates = true;
    } else if (arg === "--require-goal-policy-coverage") {
      options.requireGoalPolicyCoverage = true;
    } else if (arg === "--goal-policy-coverage-out") {
      options.goalPolicyCoverageOut = value ?? "";
      index += 1;
    } else if (arg === "--goal-policy-coverage-until-horizon") {
      options.goalPolicyCoverageUntilHorizon = value ?? "";
      options.goalPolicyCoverageUntilExplicit = true;
      index += 1;
    } else if (arg === "--required-policy-transitions") {
      options.requiredPolicyTransitions = value ?? "";
      index += 1;
    } else if (arg === "--require-policy-tagged-targets") {
      options.requirePolicyTaggedTargets = true;
    } else if (arg === "--require-positive-pending-policy-min") {
      options.requirePositivePendingPolicyMin = true;
    } else if (arg === "--require-goal-policy-readiness-audit") {
      options.requireGoalPolicyReadinessAudit = true;
    } else if (arg === "--goal-policy-readiness-audit-out") {
      options.goalPolicyReadinessAuditOut = value ?? "";
      index += 1;
    } else if (
      arg === "--goal-policy-readiness-audit-until-horizon" ||
      arg === "--goal-policy-readiness-audit-max-target-horizon"
    ) {
      options.goalPolicyReadinessAuditUntilHorizon = value ?? "";
      options.goalPolicyReadinessAuditUntilExplicit = true;
      index += 1;
    } else if (arg === "--require-goal-policy-readiness-tagged-targets") {
      options.requireGoalPolicyReadinessTaggedTargets = true;
    } else if (arg === "--require-goal-policy-readiness-positive-pending-min") {
      options.requireGoalPolicyReadinessPositivePendingMin = true;
    } else if (arg === "--progressive-goals-out") {
      options.progressiveGoalsOut = value ?? "";
      index += 1;
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
  return normalized === "H2" || normalized === "H3" || normalized === "H4" || normalized === "H5"
    ? normalized
    : fallback;
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
    }, options.timeoutMs ?? 360_000);
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
  const runStamp = stamp();
  const stage = normalizeStage(options.stage, "majority");
  const currentStage = normalizeStage(options.currentStage, "canary");
  const nextHorizon = normalizeHorizon(options.nextHorizon, "H3");
  const evidenceSelectionMode = normalizeEvidenceSelectionMode(
    options.evidenceSelectionMode,
    "latest-passing",
  );

  const outPath = path.resolve(
    options.out || path.join(evidenceDir, `h2-promotion-run-${runStamp}.json`),
  );
  const closeoutRunOut = path.resolve(
    options.closeoutRunOut || path.join(evidenceDir, `h2-closeout-run-${runStamp}.json`),
  );
  const horizonPromotionOut = path.resolve(
    options.horizonPromotionOut ||
      path.join(evidenceDir, `horizon-promotion-H2-to-${nextHorizon}-${runStamp}.json`),
  );
  const progressiveGoalsOut = path.resolve(
    options.progressiveGoalsOut ||
      path.join(evidenceDir, `progressive-horizon-goals-H2-to-${nextHorizon}-${runStamp}.json`),
  );
  const goalPolicyCoverageOut = path.resolve(
    options.goalPolicyCoverageOut ||
      path.join(evidenceDir, `goal-policy-coverage-H2-to-${nextHorizon}-${runStamp}.json`),
  );
  const goalPolicyReadinessAuditOut = path.resolve(
    options.goalPolicyReadinessAuditOut ||
      path.join(evidenceDir, `goal-policy-readiness-H2-to-${nextHorizon}-${runStamp}.json`),
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
  if (
    Number.isFinite(options.minimumGoalIncrease) &&
    (!Number.isInteger(options.minimumGoalIncrease) || options.minimumGoalIncrease < 1)
  ) {
    failures.push(`invalid_minimum_goal_increase:${String(options.minimumGoalIncrease)}`);
  }
  if (options.strictGoalPolicyGates) {
    options.requireProgressiveGoals = true;
    options.requireGoalPolicyCoverage = true;
    options.requireGoalPolicyReadinessAudit = true;
    options.requirePolicyTaggedTargets = true;
    options.requirePositivePendingPolicyMin = true;
    options.requireGoalPolicyReadinessTaggedTargets = true;
    options.requireGoalPolicyReadinessPositivePendingMin = true;
    if (!options.goalPolicyCoverageUntilExplicit) {
      options.goalPolicyCoverageUntilHorizon = nextHorizon;
    }
    if (!options.goalPolicyReadinessAuditUntilExplicit) {
      options.goalPolicyReadinessAuditUntilHorizon = nextHorizon;
    }
    if (!isNonEmptyString(options.requiredPolicyTransitions)) {
      options.requiredPolicyTransitions = `H2->${nextHorizon}`;
    }
  }

  let closeoutRunCommand = null;
  let closeoutRunPayload = null;
  let horizonPromotionCommand = null;
  let horizonPromotionPayload = null;

  if (failures.length === 0) {
    const closeoutRunArgv = [
      "node",
      "scripts/run-h2-closeout.mjs",
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
      "--next-horizon",
      nextHorizon,
      "--out",
      closeoutRunOut,
      "--evidence-selection-mode",
      evidenceSelectionMode,
      "--timeout-ms",
      String(options.timeoutMs),
    ];
    if (options.dryRun) {
      closeoutRunArgv.push("--dry-run");
    }
    if (options.allowHorizonMismatch) {
      closeoutRunArgv.push("--allow-horizon-mismatch");
    }
    if (options.skipCutoverReadiness) {
      closeoutRunArgv.push("--skip-cutover-readiness");
    }
    if (isNonEmptyString(options.canaryChats)) {
      closeoutRunArgv.push("--canary-chats", options.canaryChats);
    }
    if (isNonEmptyString(options.majorityPercent)) {
      closeoutRunArgv.push("--majority-percent", options.majorityPercent);
    }
    if (Number.isFinite(options.forceRollbackMinSuccessRate)) {
      closeoutRunArgv.push(
        "--force-rollback-min-success-rate",
        String(options.forceRollbackMinSuccessRate),
      );
    }
    if (Number.isFinite(options.forceRollbackMaxP95LatencyMs)) {
      closeoutRunArgv.push(
        "--force-rollback-max-p95-latency-ms",
        String(options.forceRollbackMaxP95LatencyMs),
      );
    }
    if (options.requireActiveNextHorizon) {
      closeoutRunArgv.push("--require-active-next-horizon");
    }
    if (!options.requireCompletedActions) {
      closeoutRunArgv.push("--allow-incomplete-actions");
    }

    closeoutRunCommand = await runCommand(closeoutRunArgv, {
      timeoutMs: options.timeoutMs,
      env: {
        UNIFIED_RUNTIME_ENV_FILE: envFile,
      },
    });
    closeoutRunPayload = await readJsonMaybe(closeoutRunOut);
    if (closeoutRunCommand.code !== 0 || closeoutRunPayload?.pass !== true) {
      failures.push("h2_closeout_run_failed");
    }
  }

  if (failures.length === 0) {
    const promoteArgv = [
      "node",
      "scripts/promote-horizon.mjs",
      "--horizon",
      "H2",
      "--next-horizon",
      nextHorizon,
      "--horizon-status-file",
      horizonStatusFile,
      "--closeout-run-file",
      closeoutRunOut,
      "--out",
      horizonPromotionOut,
      "--timeout-ms",
      String(options.timeoutMs),
    ];
    if (options.dryRun) {
      promoteArgv.push("--dry-run");
    }
    if (options.allowHorizonMismatch) {
      promoteArgv.push("--allow-horizon-mismatch");
    }
    if (options.allowInactiveSourceHorizon) {
      promoteArgv.push("--allow-inactive-source-horizon");
    }
    if (options.requireProgressiveGoals) {
      promoteArgv.push("--require-progressive-goals");
    }
    if (Number.isFinite(options.minimumGoalIncrease)) {
      promoteArgv.push("--minimum-goal-increase", String(options.minimumGoalIncrease));
    }
    if (isNonEmptyString(progressiveGoalsOut)) {
      promoteArgv.push("--progressive-goals-out", progressiveGoalsOut);
    }
    if (isNonEmptyString(options.goalPolicyKey)) {
      promoteArgv.push("--goal-policy-key", options.goalPolicyKey);
    }
    if (isNonEmptyString(options.goalPolicyFile)) {
      promoteArgv.push("--goal-policy-file", options.goalPolicyFile);
    }
    if (options.strictGoalPolicyGates) {
      promoteArgv.push("--strict-goal-policy-gates");
    }
    if (options.requireGoalPolicyCoverage) {
      promoteArgv.push("--require-goal-policy-coverage");
      promoteArgv.push("--goal-policy-coverage-out", goalPolicyCoverageOut);
      if (isNonEmptyString(options.goalPolicyCoverageUntilHorizon)) {
        promoteArgv.push(
          "--goal-policy-coverage-until-horizon",
          options.goalPolicyCoverageUntilHorizon,
        );
      }
      if (isNonEmptyString(options.requiredPolicyTransitions)) {
        promoteArgv.push("--required-policy-transitions", options.requiredPolicyTransitions);
      }
      if (options.requirePolicyTaggedTargets) {
        promoteArgv.push("--require-policy-tagged-targets");
      }
      if (options.requirePositivePendingPolicyMin) {
        promoteArgv.push("--require-positive-pending-policy-min");
      }
    }
    if (options.requireGoalPolicyReadinessAudit) {
      promoteArgv.push("--require-goal-policy-readiness-audit");
      promoteArgv.push("--goal-policy-readiness-audit-out", goalPolicyReadinessAuditOut);
      if (isNonEmptyString(options.goalPolicyReadinessAuditUntilHorizon)) {
        promoteArgv.push(
          "--goal-policy-readiness-audit-until-horizon",
          options.goalPolicyReadinessAuditUntilHorizon,
        );
      }
      if (options.requireGoalPolicyReadinessTaggedTargets) {
        promoteArgv.push("--require-goal-policy-readiness-tagged-targets");
      }
      if (options.requireGoalPolicyReadinessPositivePendingMin) {
        promoteArgv.push("--require-goal-policy-readiness-positive-pending-min");
      }
    }
    if (options.requireActiveNextHorizon) {
      promoteArgv.push("--require-active-next-horizon");
    }
    if (!options.requireCompletedActions) {
      promoteArgv.push("--allow-incomplete-actions");
    }
    if (isNonEmptyString(options.note)) {
      promoteArgv.push("--note", options.note);
    }

    horizonPromotionCommand = await runCommand(promoteArgv, { timeoutMs: options.timeoutMs });
    horizonPromotionPayload = await readJsonMaybe(horizonPromotionOut);
    if (horizonPromotionCommand.code !== 0 || horizonPromotionPayload?.pass !== true) {
      failures.push("horizon_promotion_failed");
    }
  }

  const payload = {
    generatedAtIso: new Date().toISOString(),
    pass: failures.length === 0,
    stage,
    dryRun: options.dryRun,
    files: {
      evidenceDir,
      horizonStatusFile,
      envFile,
      outPath,
      closeoutRunOut,
      horizonPromotionOut,
      progressiveGoalsOut,
      goalPolicyCoverageOut: options.requireGoalPolicyCoverage ? goalPolicyCoverageOut : null,
      goalPolicyReadinessAuditOut: options.requireGoalPolicyReadinessAudit
        ? goalPolicyReadinessAuditOut
        : null,
    },
    checks: {
      evidenceSelectionMode,
      closeoutRunPass: closeoutRunPayload?.pass === true,
      closeoutGatePass: closeoutRunPayload?.checks?.h2CloseoutGatePass === true,
      horizonPromotionPass: horizonPromotionPayload?.pass === true,
      horizonAdvanced: horizonPromotionPayload?.checks?.activeAdvanced === true,
      statusUpdated: horizonPromotionPayload?.checks?.statusUpdated === true,
      nextHorizon,
      requireCompletedActions: options.requireCompletedActions,
      requireActiveNextHorizon: options.requireActiveNextHorizon,
      progressiveGoalsPass: horizonPromotionPayload?.checks?.progressiveGoalsPass === true,
      requireProgressiveGoals: options.requireProgressiveGoals,
      minimumGoalIncrease: Number.isFinite(options.minimumGoalIncrease)
        ? options.minimumGoalIncrease
        : null,
      goalPolicyKey: isNonEmptyString(options.goalPolicyKey) ? options.goalPolicyKey : null,
      goalPolicyFile: isNonEmptyString(options.goalPolicyFile)
        ? path.resolve(options.goalPolicyFile)
        : null,
      strictGoalPolicyGates: options.strictGoalPolicyGates,
      requireGoalPolicyCoverage: options.requireGoalPolicyCoverage,
      goalPolicyCoveragePass:
        options.requireGoalPolicyCoverage === true
          ? horizonPromotionPayload?.checks?.goalPolicyCoveragePass === true
          : null,
      requireGoalPolicyReadinessAudit: options.requireGoalPolicyReadinessAudit,
      goalPolicyReadinessAuditPass:
        options.requireGoalPolicyReadinessAudit === true
          ? horizonPromotionPayload?.checks?.goalPolicyReadinessAuditPass === true
          : null,
    },
    commands: {
      closeoutRun: closeoutRunCommand,
      horizonPromotion: horizonPromotionCommand,
    },
    failures,
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (!payload.pass) {
    process.stderr.write(`H2 promotion run failed:\n- ${failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
