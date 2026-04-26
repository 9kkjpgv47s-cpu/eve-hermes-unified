#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { validateHorizonStatus } from "./validate-horizon-status.mjs";

const HORIZON_SEQUENCE = ["H1", "H2", "H3", "H4", "H5"];

function parseArgs(argv) {
  const options = {
    horizon: "",
    nextHorizon: "",
    evidenceDir: "",
    horizonStatusFile: "",
    closeoutFile: "",
    closeoutRunFile: "",
    closeoutOut: "",
    out: "",
    note: "",
    timeoutMs: 180_000,
    dryRun: false,
    requireCompletedActions: true,
    requireActiveNextHorizon: false,
    allowHorizonMismatch: false,
    allowInactiveSourceHorizon: false,
    requireProgressiveGoals: false,
    minimumGoalIncrease: 1,
    goalPolicyKey: "",
    strictGoalPolicyGates: false,
    requireGoalPolicyCoverage: false,
    goalPolicyCoverageOut: "",
    goalPolicyCoverageUntilHorizon: "H5",
    goalPolicyCoverageUntilExplicit: false,
    requiredPolicyTransitions: "",
    requireGoalPolicyReadinessAudit: false,
    goalPolicyReadinessAuditOut: "",
    goalPolicyReadinessAuditUntilHorizon: "",
    goalPolicyReadinessAuditUntilExplicit: false,
    requireGoalPolicyReadinessTaggedTargets: false,
    requireGoalPolicyReadinessPositivePendingMin: false,
    requirePolicyTaggedTargets: false,
    requirePositivePendingPolicyMin: false,
    progressiveGoalsOut: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--horizon") {
      options.horizon = value ?? "";
      index += 1;
    } else if (arg === "--next-horizon") {
      options.nextHorizon = value ?? "";
      index += 1;
    } else if (arg === "--evidence-dir") {
      options.evidenceDir = value ?? "";
      index += 1;
    } else if (arg === "--horizon-status-file") {
      options.horizonStatusFile = value ?? "";
      index += 1;
    } else if (arg === "--closeout-file" || arg === "--closeout-report") {
      options.closeoutFile = value ?? "";
      index += 1;
    } else if (arg === "--closeout-run-file" || arg === "--closeout-run-report") {
      options.closeoutRunFile = value ?? "";
      index += 1;
    } else if (arg === "--closeout-out") {
      options.closeoutOut = value ?? "";
      index += 1;
    } else if (arg === "--out") {
      options.out = value ?? "";
      index += 1;
    } else if (arg === "--note") {
      options.note = value ?? "";
      index += 1;
    } else if (arg === "--timeout-ms") {
      options.timeoutMs = Number(value ?? "180000");
      index += 1;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--allow-incomplete-actions") {
      options.requireCompletedActions = false;
    } else if (arg === "--require-active-next-horizon") {
      options.requireActiveNextHorizon = true;
    } else if (arg === "--allow-horizon-mismatch") {
      options.allowHorizonMismatch = true;
    } else if (arg === "--allow-inactive-source-horizon") {
      options.allowInactiveSourceHorizon = true;
    } else if (arg === "--require-progressive-goals") {
      options.requireProgressiveGoals = true;
    } else if (arg === "--minimum-goal-increase" || arg === "--min-goal-increase") {
      options.minimumGoalIncrease = Number(value ?? "1");
      index += 1;
    } else if (arg === "--goal-policy-key") {
      options.goalPolicyKey = value ?? "";
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
    } else if (arg === "--require-goal-policy-readiness-audit") {
      options.requireGoalPolicyReadinessAudit = true;
    } else if (arg === "--goal-policy-readiness-audit-out") {
      options.goalPolicyReadinessAuditOut = value ?? "";
      index += 1;
    } else if (
      arg === "--goal-policy-readiness-audit-until-horizon" ||
      arg === "--goal-policy-readiness-max-target-horizon"
    ) {
      options.goalPolicyReadinessAuditUntilHorizon = value ?? "";
      options.goalPolicyReadinessAuditUntilExplicit = true;
      index += 1;
    } else if (
      arg === "--require-goal-policy-readiness-tagged-targets" ||
      arg === "--require-goal-policy-readiness-tagged-requirements"
    ) {
      options.requireGoalPolicyReadinessTaggedTargets = true;
    } else if (arg === "--require-goal-policy-readiness-positive-pending-min") {
      options.requireGoalPolicyReadinessPositivePendingMin = true;
    } else if (arg === "--require-policy-tagged-targets") {
      options.requirePolicyTaggedTargets = true;
    } else if (arg === "--require-positive-pending-policy-min") {
      options.requirePositivePendingPolicyMin = true;
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

function normalizeHorizon(value, fallback = "") {
  const normalized = String(value ?? "").trim().toUpperCase();
  return HORIZON_SEQUENCE.includes(normalized) ? normalized : fallback;
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
}

function isFinitePositiveNumber(value) {
  return Number.isFinite(value) && value > 0;
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
  return JSON.parse(await readFile(targetPath, "utf8"));
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
    }, options.timeoutMs ?? 180_000);
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
  const horizonStatusFile = path.resolve(
    options.horizonStatusFile || path.join(process.cwd(), "docs/HORIZON_STATUS.json"),
  );
  const evidenceDir = path.resolve(options.evidenceDir || path.join(process.cwd(), "evidence"));
  const statusPayload = await readJson(horizonStatusFile);
  const statusValidation = validateHorizonStatus(statusPayload);

  const sourceHorizon = normalizeHorizon(options.horizon, statusPayload?.activeHorizon ?? "");
  const sourceIndex = HORIZON_SEQUENCE.indexOf(sourceHorizon);
  const derivedNext = sourceIndex >= 0 ? HORIZON_SEQUENCE[sourceIndex + 1] ?? "" : "";
  const nextHorizon = normalizeHorizon(options.nextHorizon, derivedNext);
  const runStamp = stamp();
  const closeoutOut = path.resolve(
    options.closeoutOut || path.join(evidenceDir, `horizon-closeout-${sourceHorizon}-${runStamp}.json`),
  );
  const progressiveGoalsOut = path.resolve(
    options.progressiveGoalsOut ||
      path.join(
        evidenceDir,
        `progressive-goals-check-${sourceHorizon}-to-${nextHorizon}-${runStamp}.json`,
      ),
  );
  const goalPolicyCoverageOut = path.resolve(
    options.goalPolicyCoverageOut ||
      path.join(
        evidenceDir,
        `goal-policy-coverage-${sourceHorizon}-to-${nextHorizon}-${runStamp}.json`,
      ),
  );
  const goalPolicyReadinessAuditOut = path.resolve(
    options.goalPolicyReadinessAuditOut ||
      path.join(
        evidenceDir,
        `goal-policy-readiness-audit-${sourceHorizon}-to-${nextHorizon}-${runStamp}.json`,
      ),
  );
  const outPath = path.resolve(
    options.out || path.join(evidenceDir, `horizon-promotion-${sourceHorizon}-to-${nextHorizon}-${runStamp}.json`),
  );
  let closeoutFile = path.resolve(options.closeoutFile || closeoutOut);
  const closeoutRunFile = isNonEmptyString(options.closeoutRunFile)
    ? path.resolve(options.closeoutRunFile)
    : "";

  const failures = [];
  if (!statusValidation.valid) {
    failures.push(...statusValidation.errors.map((error) => `horizon_status_invalid:${error}`));
  }
  if (!(await exists(horizonStatusFile))) {
    failures.push(`missing_horizon_status_file:${horizonStatusFile}`);
  }
  if (!sourceHorizon) {
    failures.push(`invalid_horizon:${options.horizon || "<empty>"}`);
  }
  if (!nextHorizon) {
    failures.push(`invalid_next_horizon:${options.nextHorizon || "<empty>"}`);
  }
  if (isNonEmptyString(options.closeoutFile) && closeoutRunFile.length > 0) {
    failures.push("conflicting_closeout_sources:closeout_file_and_closeout_run_file");
  }
  if (!options.closeoutFile && !(await exists(evidenceDir))) {
    failures.push(`missing_evidence_dir:${evidenceDir}`);
  }
  if (
    Number.isFinite(options.timeoutMs) &&
    (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1000)
  ) {
    failures.push(`invalid_timeout_ms:${String(options.timeoutMs)}`);
  }
  if (
    Number.isFinite(options.minimumGoalIncrease) &&
    (!Number.isInteger(options.minimumGoalIncrease) || options.minimumGoalIncrease < 0)
  ) {
    failures.push(`invalid_minimum_goal_increase:${String(options.minimumGoalIncrease)}`);
  }
  const goalPolicyKey = String(options.goalPolicyKey ?? "").trim();
  if (isNonEmptyString(goalPolicyKey)) {
    const goalPolicies =
      statusPayload?.goalPolicies && typeof statusPayload.goalPolicies === "object"
        ? statusPayload.goalPolicies
        : {};
    const transitions =
      goalPolicies?.transitions &&
      typeof goalPolicies.transitions === "object" &&
      !Array.isArray(goalPolicies.transitions)
        ? goalPolicies.transitions
        : goalPolicies;
    const policy = transitions?.[goalPolicyKey];
    if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
      failures.push(`missing_goal_policy_key:${goalPolicyKey}`);
    } else {
      const policyMinimumGoalIncrease = Number(policy.minimumGoalIncrease);
      if (
        Number.isFinite(policyMinimumGoalIncrease) &&
        Number.isInteger(policyMinimumGoalIncrease) &&
        policyMinimumGoalIncrease >= 0
      ) {
        options.minimumGoalIncrease = Math.max(options.minimumGoalIncrease, policyMinimumGoalIncrease);
      }
    }
  }

  if (
    !options.allowInactiveSourceHorizon &&
    sourceHorizon &&
    sourceHorizon !== String(statusPayload?.activeHorizon ?? "")
  ) {
    failures.push(`source_horizon_not_active:${sourceHorizon}!=${String(statusPayload?.activeHorizon ?? "")}`);
  }

  if (sourceHorizon && nextHorizon) {
    const expectedNext = derivedNext;
    if (expectedNext && nextHorizon !== expectedNext) {
      failures.push(`next_horizon_sequence_mismatch:${nextHorizon}!=${expectedNext}`);
    }
    if (HORIZON_SEQUENCE.indexOf(nextHorizon) <= HORIZON_SEQUENCE.indexOf(sourceHorizon)) {
      failures.push(`next_horizon_not_forward:${sourceHorizon}->${nextHorizon}`);
    }
  }
  if (options.strictGoalPolicyGates) {
    options.requireProgressiveGoals = true;
    options.requireGoalPolicyCoverage = true;
    options.requireGoalPolicyReadinessAudit = true;
    options.requirePolicyTaggedTargets = true;
    options.requirePositivePendingPolicyMin = true;
    options.requireGoalPolicyReadinessTaggedTargets = true;
    options.requireGoalPolicyReadinessPositivePendingMin = true;
    if (!options.goalPolicyCoverageUntilExplicit && nextHorizon) {
      options.goalPolicyCoverageUntilHorizon = nextHorizon;
    }
    if (!options.goalPolicyReadinessAuditUntilExplicit && nextHorizon) {
      options.goalPolicyReadinessAuditUntilHorizon = nextHorizon;
    }
    if (!isNonEmptyString(options.requiredPolicyTransitions) && sourceHorizon && nextHorizon) {
      options.requiredPolicyTransitions = `${sourceHorizon}->${nextHorizon}`;
    }
    if (!isNonEmptyString(options.goalPolicyKey) && sourceHorizon && nextHorizon) {
      options.goalPolicyKey = `${sourceHorizon}->${nextHorizon}`;
    }
  }

  let closeoutRunPayload = null;
  if (failures.length === 0 && closeoutRunFile.length > 0) {
    if (!(await exists(closeoutRunFile))) {
      failures.push(`missing_closeout_run_file:${closeoutRunFile}`);
    } else {
      closeoutRunPayload = await readJson(closeoutRunFile);
      if (closeoutRunPayload?.pass !== true) {
        failures.push("closeout_run_not_passed");
      }
      const derivedCloseoutFile = String(closeoutRunPayload?.files?.closeoutOut ?? "").trim();
      if (!isNonEmptyString(derivedCloseoutFile)) {
        failures.push("closeout_run_missing_closeout_out");
      } else {
        closeoutFile = path.resolve(derivedCloseoutFile);
      }
    }
  }

  let closeoutCommand = null;
  let progressiveGoalsCommand = null;
  let goalPolicyCoverageCommand = null;
  let goalPolicyReadinessAuditCommand = null;
  let closeoutPayload = null;
  let progressiveGoalsPayload = null;
  let goalPolicyCoveragePayload = null;
  let goalPolicyReadinessAuditPayload = null;
  if (failures.length === 0 && !options.closeoutFile && closeoutRunFile.length === 0) {
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
  }

  if (!(await exists(closeoutFile))) {
    failures.push(`missing_closeout_file:${closeoutFile}`);
  } else {
    closeoutPayload = await readJson(closeoutFile);
    if (closeoutPayload?.pass !== true) {
      failures.push("closeout_not_passed");
    }
  }
  if (closeoutCommand && closeoutCommand.code !== 0) {
    failures.push(`closeout_command_failed:${String(closeoutCommand.code)}`);
  }

  if (failures.length === 0 && options.requireProgressiveGoals) {
    const progressiveGoalsArgv = [
      "node",
      "scripts/check-progressive-horizon-goals.mjs",
      "--horizon-status-file",
      horizonStatusFile,
      "--source-horizon",
      sourceHorizon,
      "--next-horizon",
      nextHorizon,
      "--minimum-goal-increase",
      String(options.minimumGoalIncrease),
      "--policy-key",
      String(options.goalPolicyKey ?? "").trim(),
      "--out",
      progressiveGoalsOut,
    ];
    progressiveGoalsCommand = await runCommand(progressiveGoalsArgv, { timeoutMs: options.timeoutMs });
    progressiveGoalsPayload = await readJson(progressiveGoalsOut);
    if (progressiveGoalsCommand.code !== 0 || progressiveGoalsPayload?.pass !== true) {
      failures.push("progressive_goals_gate_failed");
    }
  }
  if (failures.length === 0 && options.requireGoalPolicyCoverage) {
    const coverageUntilHorizon = normalizeHorizon(
      options.goalPolicyCoverageUntilHorizon,
      "H5",
    );
    const goalPolicyCoverageArgv = [
      "node",
      "scripts/check-goal-policy-coverage.mjs",
      "--horizon-status-file",
      horizonStatusFile,
      "--source-horizon",
      sourceHorizon,
      "--until-horizon",
      coverageUntilHorizon,
      "--out",
      goalPolicyCoverageOut,
    ];
    if (isNonEmptyString(options.goalPolicyKey)) {
      goalPolicyCoverageArgv.push("--required-policy-key", options.goalPolicyKey);
    }
    if (isNonEmptyString(options.requiredPolicyTransitions)) {
      goalPolicyCoverageArgv.push("--required-policy-transitions", options.requiredPolicyTransitions);
    }
    if (options.requirePolicyTaggedTargets) {
      goalPolicyCoverageArgv.push("--require-tagged-requirements");
    }
    if (options.requirePositivePendingPolicyMin) {
      goalPolicyCoverageArgv.push("--require-positive-pending-min");
    }
    goalPolicyCoverageCommand = await runCommand(goalPolicyCoverageArgv, { timeoutMs: options.timeoutMs });
    goalPolicyCoveragePayload = await readJson(goalPolicyCoverageOut);
    if (goalPolicyCoverageCommand.code !== 0 || goalPolicyCoveragePayload?.pass !== true) {
      failures.push("goal_policy_coverage_gate_failed");
    }
  }
  if (failures.length === 0 && options.requireGoalPolicyReadinessAudit) {
    const auditUntilHorizon = normalizeHorizon(
      options.goalPolicyReadinessAuditUntilHorizon,
      nextHorizon || "H5",
    );
    const goalPolicyReadinessAuditArgv = [
      "node",
      "scripts/audit-goal-policy-readiness.mjs",
      "--horizon-status-file",
      horizonStatusFile,
      "--source-horizon",
      sourceHorizon,
      "--until-horizon",
      auditUntilHorizon,
      "--out",
      goalPolicyReadinessAuditOut,
    ];
    if (options.requireGoalPolicyReadinessTaggedTargets) {
      goalPolicyReadinessAuditArgv.push("--require-tagged-requirements");
    }
    if (options.requireGoalPolicyReadinessPositivePendingMin) {
      goalPolicyReadinessAuditArgv.push("--require-positive-pending-min");
    }
    goalPolicyReadinessAuditCommand = await runCommand(goalPolicyReadinessAuditArgv, {
      timeoutMs: options.timeoutMs,
    });
    goalPolicyReadinessAuditPayload = await readJson(goalPolicyReadinessAuditOut);
    if (
      goalPolicyReadinessAuditCommand.code !== 0 ||
      goalPolicyReadinessAuditPayload?.pass !== true
    ) {
      failures.push("goal_policy_readiness_audit_gate_failed");
    }
  }

  const before = {
    activeHorizon: String(statusPayload?.activeHorizon ?? ""),
    activeStatus: String(statusPayload?.activeStatus ?? ""),
    sourceStatus: String(statusPayload?.horizonStates?.[sourceHorizon]?.status ?? ""),
    nextStatus: String(statusPayload?.horizonStates?.[nextHorizon]?.status ?? ""),
  };

  let updatedStatus = statusPayload;
  let statusWritePath = null;
  if (failures.length === 0) {
    const promotionNote = isNonEmptyString(options.note)
      ? options.note.trim()
      : `Promoted ${sourceHorizon} to completed and advanced active horizon to ${nextHorizon} via closeout gate`;
    updatedStatus = {
      ...statusPayload,
      updatedAtIso: new Date().toISOString(),
      activeHorizon: nextHorizon,
      activeStatus: "in_progress",
      horizonStates: {
        ...statusPayload.horizonStates,
        [sourceHorizon]: {
          ...(statusPayload.horizonStates?.[sourceHorizon] ?? {}),
          status: "completed",
        },
        [nextHorizon]: {
          ...(statusPayload.horizonStates?.[nextHorizon] ?? {}),
          status: "in_progress",
        },
      },
      history: [
        ...(Array.isArray(statusPayload.history) ? statusPayload.history : []),
        {
          timestamp: new Date().toISOString(),
          horizon: sourceHorizon,
          status: "completed",
          note: promotionNote,
        },
        {
          timestamp: new Date().toISOString(),
          horizon: nextHorizon,
          status: "in_progress",
          note: `Active horizon advanced to ${nextHorizon} after ${sourceHorizon} closeout`,
        },
      ],
    };
    const postValidation = validateHorizonStatus(updatedStatus);
    if (!postValidation.valid) {
      failures.push(...postValidation.errors.map((error) => `updated_horizon_status_invalid:${error}`));
    } else if (!options.dryRun) {
      await writeFile(horizonStatusFile, `${JSON.stringify(updatedStatus, null, 2)}\n`, "utf8");
      statusWritePath = horizonStatusFile;
    }
  }

  const after = {
    activeHorizon: String(updatedStatus?.activeHorizon ?? ""),
    activeStatus: String(updatedStatus?.activeStatus ?? ""),
    sourceStatus: String(updatedStatus?.horizonStates?.[sourceHorizon]?.status ?? ""),
    nextStatus: String(updatedStatus?.horizonStates?.[nextHorizon]?.status ?? ""),
  };

  const payload = {
    generatedAtIso: new Date().toISOString(),
    pass: failures.length === 0,
    promoted: failures.length === 0,
    dryRun: options.dryRun,
    horizon: {
      source: sourceHorizon || null,
      next: nextHorizon || null,
    },
    files: {
      horizonStatusFile,
      evidenceDir: options.closeoutFile ? null : evidenceDir,
      closeoutFile,
      closeoutOut: options.closeoutFile ? null : closeoutOut,
      closeoutRunFile: closeoutRunFile || null,
      progressiveGoalsOut: options.requireProgressiveGoals ? progressiveGoalsOut : null,
      goalPolicyCoverageOut: options.requireGoalPolicyCoverage ? goalPolicyCoverageOut : null,
      goalPolicyReadinessAuditOut: options.requireGoalPolicyReadinessAudit
        ? goalPolicyReadinessAuditOut
        : null,
      outPath,
      statusWritePath,
    },
    checks: {
      closeoutPass: closeoutPayload?.pass === true,
      sourceWasActive:
        sourceHorizon.length > 0 && sourceHorizon === String(statusPayload?.activeHorizon ?? ""),
      statusUpdated: isNonEmptyString(statusWritePath),
      activeAdvanced:
        failures.length === 0 &&
        String(updatedStatus?.activeHorizon ?? "") === nextHorizon &&
        String(updatedStatus?.activeStatus ?? "") === "in_progress",
      requireCompletedActions: options.requireCompletedActions,
      requireActiveNextHorizon: options.requireActiveNextHorizon,
      allowHorizonMismatch: options.allowHorizonMismatch,
      closeoutRunPass: closeoutRunPayload?.pass === true,
      requireProgressiveGoals: options.requireProgressiveGoals,
      strictGoalPolicyGates: options.strictGoalPolicyGates,
      goalPolicyKey:
        options.requireProgressiveGoals === true
          ? String(options.goalPolicyKey ?? "").trim() || null
          : null,
      requireGoalPolicyCoverage: options.requireGoalPolicyCoverage,
      goalPolicyCoverageUntilHorizon:
        options.requireGoalPolicyCoverage === true
          ? normalizeHorizon(options.goalPolicyCoverageUntilHorizon, nextHorizon || "H5") || null
          : null,
      requiredPolicyTransitions:
        options.requireGoalPolicyCoverage === true && isNonEmptyString(options.requiredPolicyTransitions)
          ? String(options.requiredPolicyTransitions ?? "").trim()
          : null,
      goalPolicyCoveragePass:
        options.requireGoalPolicyCoverage === true
          ? goalPolicyCoveragePayload?.pass === true
          : null,
      requireGoalPolicyReadinessAudit: options.requireGoalPolicyReadinessAudit,
      goalPolicyReadinessAuditPass:
        options.requireGoalPolicyReadinessAudit === true
          ? goalPolicyReadinessAuditPayload?.pass === true
          : null,
      goalPolicyReadinessAuditUntilHorizon:
        options.requireGoalPolicyReadinessAudit === true
          ? normalizeHorizon(options.goalPolicyReadinessAuditUntilHorizon, nextHorizon || "H5") || null
          : null,
      progressiveGoalsPass:
        options.requireProgressiveGoals === true
          ? progressiveGoalsPayload?.pass === true
          : null,
    },
    status: {
      before,
      after,
    },
    commands: {
      closeout: closeoutCommand,
      goalPolicyCoverage: goalPolicyCoverageCommand,
      goalPolicyReadinessAudit: goalPolicyReadinessAuditCommand,
      progressiveGoals: progressiveGoalsCommand,
    },
    failures,
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (!payload.pass) {
    process.stderr.write(`Horizon promotion failed:\n- ${failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
