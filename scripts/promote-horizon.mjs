#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { validateHorizonStatus } from "./validate-horizon-status.mjs";
import { validateManifestSchema } from "./validate-manifest-schema.mjs";
import { resolveGoalPolicySource } from "./goal-policy-source.mjs";

const HORIZON_SEQUENCE = ["H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8", "H9", "H10", "H11", "H12", "H13", "H14", "H15", "H16", "H17", "H18", "H19", "H20", "H22"];

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
    goalPolicyFile: "",
    strictGoalPolicyGates: false,
    requireGoalPolicySourceConsistency: false,
    requireGoalPolicyCoverage: false,
    goalPolicyCoverageOut: "",
    goalPolicyCoverageUntilHorizon: "H12",
    goalPolicyCoverageUntilExplicit: false,
    requiredPolicyTransitions: "",
    requireGoalPolicyFileValidation: false,
    goalPolicyFileValidationOut: "",
    goalPolicyFileValidationUntilHorizon: "",
    goalPolicyFileValidationUntilExplicit: false,
    allowGoalPolicyFileValidationFallback: false,
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
    } else if (arg === "--goal-policy-file") {
      options.goalPolicyFile = value ?? "";
      index += 1;
    } else if (arg === "--strict-goal-policy-gates" || arg === "--require-strict-goal-policy-gates") {
      options.strictGoalPolicyGates = true;
    } else if (
      arg === "--require-goal-policy-source-consistency" ||
      arg === "--require-goal-policy-source-integrity"
    ) {
      options.requireGoalPolicySourceConsistency = true;
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
    } else if (
      arg === "--require-goal-policy-file-validation" ||
      arg === "--require-goal-policy-validation"
    ) {
      options.requireGoalPolicyFileValidation = true;
    } else if (
      arg === "--goal-policy-file-validation-out" ||
      arg === "--goal-policy-validation-out"
    ) {
      options.goalPolicyFileValidationOut = value ?? "";
      index += 1;
    } else if (
      arg === "--goal-policy-file-validation-until-horizon" ||
      arg === "--goal-policy-file-validation-max-target-horizon" ||
      arg === "--goal-policy-validation-until-horizon" ||
      arg === "--goal-policy-validation-max-target-horizon"
    ) {
      options.goalPolicyFileValidationUntilHorizon = value ?? "";
      options.goalPolicyFileValidationUntilExplicit = true;
      index += 1;
    } else if (
      arg === "--allow-goal-policy-file-validation-fallback" ||
      arg === "--allow-goal-policy-validation-fallback"
    ) {
      options.allowGoalPolicyFileValidationFallback = true;
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

function resolveBooleanCandidate(checks, keys) {
  for (const key of keys) {
    if (checks?.[key] === true) {
      return true;
    }
  }
  return false;
}

function resolveCloseoutGateSignals(closeoutRunPayload) {
  const checks =
    closeoutRunPayload?.checks && typeof closeoutRunPayload.checks === "object"
      ? closeoutRunPayload.checks
      : {};
  const reported =
    typeof checks.h2CloseoutGatePass === "boolean" ||
    typeof checks.horizonCloseoutGatePass === "boolean";
  const pass = resolveBooleanCandidate(checks, [
    "h2CloseoutGatePass",
    "horizonCloseoutGatePass",
  ]);
  return {
    reported,
    pass,
    h2Reported: typeof checks.h2CloseoutGatePass === "boolean",
    h2Pass: checks.h2CloseoutGatePass === true,
    horizonReported: typeof checks.horizonCloseoutGatePass === "boolean",
    horizonPass: checks.horizonCloseoutGatePass === true,
  };
}

function resolveCloseoutRunStageGoalPolicySignals(closeoutRunPayload) {
  const checks =
    closeoutRunPayload?.checks && typeof closeoutRunPayload.checks === "object"
      ? closeoutRunPayload.checks
      : {};
  const supervisedSimulationPass = resolveBooleanCandidate(checks, ["supervisedSimulationPass"]);
  const validationPropagationPass = resolveBooleanCandidate(checks, [
    "supervisedSimulationStageGoalPolicyPropagationPassed",
    "supervisedSimulationStageGoalPolicyValidationPropagationPassed",
    "supervisedSimulationStageGoalPolicyPropagationPass",
    "supervisedSimulationStagePolicySignalsPass",
  ]);
  const validationPropagationReported = resolveBooleanCandidate(checks, [
    "supervisedSimulationStageGoalPolicyPropagationReported",
    "supervisedSimulationStageGoalPolicyValidationPropagationReported",
    "supervisedSimulationStagePolicySignalsReported",
  ]);
  const sourceConsistencyPropagationReported = resolveBooleanCandidate(checks, [
    "supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported",
    "supervisedSimulationStageSourceConsistencySignalsReported",
  ]);
  const sourceConsistencyPropagationPass = resolveBooleanCandidate(checks, [
    "supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed",
    "supervisedSimulationStageSourceConsistencySignalsPass",
  ]);
  return {
    supervisedSimulationPass,
    validationReported: validationPropagationReported,
    validationPass: validationPropagationPass,
    sourceConsistencyReported: sourceConsistencyPropagationReported,
    sourceConsistencyPass: sourceConsistencyPropagationPass,
    reported: validationPropagationReported && sourceConsistencyPropagationReported,
    pass: validationPropagationPass && sourceConsistencyPropagationPass,
  };
}

function resolveCloseoutRunH2CloseoutGate(closeoutRunPayload) {
  const checks =
    closeoutRunPayload?.checks && typeof closeoutRunPayload.checks === "object"
      ? closeoutRunPayload.checks
      : {};
  const reported =
    typeof checks.h2CloseoutGatePass === "boolean"
    || typeof checks.horizonCloseoutGatePass === "boolean";
  const pass =
    checks.h2CloseoutGatePass === true
    || checks.horizonCloseoutGatePass === true;
  return {
    reported,
    pass,
  };
}

function resolveHorizonAliasSignals(entries) {
  const rawValues = entries
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
  const normalizedPairs = rawValues.map((raw) => ({
    raw,
    normalized: normalizeHorizon(raw, ""),
  }));
  const normalizedValues = normalizedPairs
    .map((entry) => entry.normalized)
    .filter((value) => value.length > 0);
  const invalidValues = Array.from(
    new Set(
      normalizedPairs
        .filter((entry) => entry.normalized.length === 0)
        .map((entry) => entry.raw),
    ),
  );
  const uniqueValues = Array.from(new Set(normalizedValues));
  return {
    reported: uniqueValues.length > 0,
    value: uniqueValues[0] ?? "",
    conflict: uniqueValues.length > 1,
    values: uniqueValues,
    invalid: invalidValues.length > 0,
    invalidValues,
  };
}

function resolveCloseoutRunTransition(closeoutRunPayload, expectedSource, expectedNext) {
  const checks =
    closeoutRunPayload?.checks && typeof closeoutRunPayload.checks === "object"
      ? closeoutRunPayload.checks
      : {};
  const horizon =
    closeoutRunPayload?.horizon && typeof closeoutRunPayload.horizon === "object"
      ? closeoutRunPayload.horizon
      : {};
  const sourceSignals = resolveHorizonAliasSignals([
    horizon.source,
    horizon.current,
    horizon.from,
    closeoutRunPayload?.sourceHorizon,
    checks.sourceHorizon,
  ]);
  const nextSignals = resolveHorizonAliasSignals([
    horizon.next,
    horizon.nextHorizon,
    horizon.to,
    closeoutRunPayload?.nextHorizon,
    checks.nextHorizon,
  ]);
  const normalizedSource = sourceSignals.value;
  const inferredH2Source =
    !normalizedSource && typeof checks.h2CloseoutGatePass === "boolean" ? "H2" : "";
  const effectiveSource = normalizedSource || inferredH2Source;
  const normalizedNext = nextSignals.value;
  const sourceReported = isNonEmptyString(effectiveSource);
  const nextReported = nextSignals.reported;
  return {
    source: sourceReported ? effectiveSource : null,
    next: nextReported ? normalizedNext : null,
    sourceReported,
    nextReported,
    sourceInvalid: sourceSignals.invalid,
    nextInvalid: nextSignals.invalid,
    sourceInvalidValues: sourceSignals.invalidValues,
    nextInvalidValues: nextSignals.invalidValues,
    sourceAliasConflict: sourceSignals.conflict,
    nextAliasConflict: nextSignals.conflict,
    sourceAliases: sourceSignals.values,
    nextAliases: nextSignals.values,
    sourceMatches: sourceReported && effectiveSource === expectedSource,
    nextMatches: nextReported && normalizedNext === expectedNext,
  };
}

function resolveCloseoutRunCloseoutPathSignals(closeoutRunPayload, closeoutRunPath = "") {
  const baseDir = isNonEmptyString(closeoutRunPath)
    ? path.dirname(path.resolve(closeoutRunPath))
    : process.cwd();
  const files =
    closeoutRunPayload?.files && typeof closeoutRunPayload.files === "object"
      ? closeoutRunPayload.files
      : {};
  const candidates = [
    { key: "files.closeoutOut", value: files.closeoutOut },
    { key: "files.closeoutFile", value: files.closeoutFile },
    { key: "closeoutOut", value: closeoutRunPayload?.closeoutOut },
  ]
    .map((entry) => {
      const trimmed = typeof entry.value === "string" ? entry.value.trim() : "";
      if (!isNonEmptyString(trimmed)) {
        return null;
      }
      return {
        key: entry.key,
        raw: trimmed,
        resolved: path.isAbsolute(trimmed) ? path.resolve(trimmed) : path.resolve(baseDir, trimmed),
      };
    })
    .filter(Boolean);
  const uniqueResolved = new Set(candidates.map((entry) => entry.resolved));
  return {
    candidates,
    hasAny: candidates.length > 0,
    allAligned: uniqueResolved.size <= 1,
    resolvedPath: candidates.length > 0 ? candidates[0].resolved : "",
  };
}

function resolveCloseoutTransition(closeoutPayload, expectedSource, expectedNext) {
  const closeout =
    closeoutPayload?.closeout && typeof closeoutPayload.closeout === "object"
      ? closeoutPayload.closeout
      : {};
  const horizon =
    closeoutPayload?.horizon && typeof closeoutPayload.horizon === "object"
      ? closeoutPayload.horizon
      : {};
  const checks =
    closeoutPayload?.checks && typeof closeoutPayload.checks === "object"
      ? closeoutPayload.checks
      : {};
  const nextHorizonChecks =
    checks.nextHorizon && typeof checks.nextHorizon === "object" ? checks.nextHorizon : {};
  const sourceSignals = resolveHorizonAliasSignals([
    closeout.horizon,
    closeout.currentHorizon,
    closeout.sourceHorizon,
    horizon.source,
    closeoutPayload?.sourceHorizon,
    checks.sourceHorizon,
  ]);
  const nextSignals = resolveHorizonAliasSignals([
    closeout.nextHorizon,
    closeout.next,
    closeout.targetNextHorizon,
    horizon.next,
    closeoutPayload?.nextHorizon,
    checks.nextHorizon,
    nextHorizonChecks.selectedNextHorizon,
    nextHorizonChecks.nextHorizon,
  ]);
  const source = sourceSignals.value;
  const next = nextSignals.value;
  return {
    source: source || null,
    next: next || null,
    sourceReported: source.length > 0,
    nextReported: next.length > 0,
    sourceInvalid: sourceSignals.invalid,
    nextInvalid: nextSignals.invalid,
    sourceInvalidValues: sourceSignals.invalidValues,
    nextInvalidValues: nextSignals.invalidValues,
    sourceAliasConflict: sourceSignals.conflict,
    nextAliasConflict: nextSignals.conflict,
    sourceAliases: sourceSignals.values,
    nextAliases: nextSignals.values,
    sourceMatches: source.length > 0 && source === expectedSource,
    nextMatches: next.length > 0 && next === expectedNext,
  };
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
  const goalPolicySource = await resolveGoalPolicySource({
    horizonStatus: statusPayload,
    horizonStatusFile,
    goalPolicyFile: options.goalPolicyFile,
    requireGoalPolicySourceConsistency:
      options.requireGoalPolicySourceConsistency || options.strictGoalPolicyGates,
  });
  const resolvedGoalPolicyFile = isNonEmptyString(goalPolicySource.goalPolicyFile)
    ? path.resolve(goalPolicySource.goalPolicyFile)
    : null;

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
  const goalPolicyFileValidationOut = path.resolve(
    options.goalPolicyFileValidationOut ||
      path.join(
        evidenceDir,
        `goal-policy-file-validation-${sourceHorizon}-to-${nextHorizon}-${runStamp}.json`,
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
  if (!goalPolicySource.ok) {
    failures.push(...goalPolicySource.errors.map((error) => `goal_policy_source_invalid:${error}`));
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
    const transitions = goalPolicySource.transitions;
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
    options.requireGoalPolicySourceConsistency = true;
    options.requireProgressiveGoals = true;
    options.requireGoalPolicyFileValidation = true;
    options.allowGoalPolicyFileValidationFallback = true;
    options.requireGoalPolicyCoverage = true;
    options.requireGoalPolicyReadinessAudit = true;
    options.requirePolicyTaggedTargets = true;
    options.requirePositivePendingPolicyMin = true;
    options.requireGoalPolicyReadinessTaggedTargets = true;
    options.requireGoalPolicyReadinessPositivePendingMin = true;
    if (!options.goalPolicyFileValidationUntilExplicit && nextHorizon) {
      options.goalPolicyFileValidationUntilHorizon = nextHorizon;
    }
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
  let closeoutRunTransition = {
    source: null,
    next: null,
    sourceReported: false,
    nextReported: false,
    sourceInvalid: false,
    nextInvalid: false,
    sourceInvalidValues: [],
    nextInvalidValues: [],
    sourceAliasConflict: false,
    nextAliasConflict: false,
    sourceAliases: [],
    nextAliases: [],
    sourceMatches: false,
    nextMatches: false,
  };
  let closeoutRunPathSignals = {
    candidates: [],
    hasAny: false,
    allAligned: false,
    resolvedPath: "",
  };
  let closeoutRunCloseoutGate = { reported: false, pass: false };
  let closeoutRunH2CloseoutGate = { reported: false, pass: false };
  let closeoutRunStageGoalPolicySignals = { reported: false, pass: false };
  let closeoutRunSchemaValidation = { valid: false, errors: ["closeout_run_not_loaded"] };
  if (failures.length === 0 && closeoutRunFile.length > 0) {
    if (!(await exists(closeoutRunFile))) {
      failures.push(`missing_closeout_run_file:${closeoutRunFile}`);
    } else {
      closeoutRunPayload = await readJson(closeoutRunFile);
      closeoutRunSchemaValidation = validateManifestSchema("h2-closeout-run", closeoutRunPayload);
      if (!closeoutRunSchemaValidation.valid) {
        failures.push(
          ...closeoutRunSchemaValidation.errors.map((error) => `closeout_run_schema_invalid:${error}`),
        );
      }
      closeoutRunTransition = resolveCloseoutRunTransition(
        closeoutRunPayload,
        sourceHorizon,
        nextHorizon,
      );
      closeoutRunPathSignals = resolveCloseoutRunCloseoutPathSignals(closeoutRunPayload, closeoutRunFile);
      closeoutRunCloseoutGate = resolveCloseoutRunH2CloseoutGate(closeoutRunPayload);
      closeoutRunH2CloseoutGate = closeoutRunCloseoutGate;
      closeoutRunStageGoalPolicySignals = resolveCloseoutRunStageGoalPolicySignals(closeoutRunPayload);
      if (closeoutRunPayload?.pass !== true) {
        failures.push("closeout_run_not_passed");
      }
      if (sourceHorizon && nextHorizon) {
        if (closeoutRunTransition.sourceInvalid) {
          failures.push("closeout_run_horizon_source_invalid");
        } else if (!closeoutRunTransition.sourceReported) {
          failures.push("closeout_run_horizon_source_not_reported");
        } else if (closeoutRunTransition.sourceAliasConflict) {
          failures.push("closeout_run_horizon_source_alias_conflict");
        } else if (!closeoutRunTransition.sourceMatches) {
          failures.push(
            `closeout_run_horizon_source_mismatch:${String(closeoutRunTransition.source)}!=${sourceHorizon}`,
          );
        }
        if (closeoutRunTransition.nextInvalid) {
          failures.push("closeout_run_horizon_next_invalid");
        } else if (!closeoutRunTransition.nextReported) {
          failures.push("closeout_run_horizon_next_not_reported");
        } else if (closeoutRunTransition.nextAliasConflict) {
          failures.push("closeout_run_horizon_next_alias_conflict");
        } else if (!closeoutRunTransition.nextMatches) {
          failures.push(
            `closeout_run_horizon_next_mismatch:${String(closeoutRunTransition.next)}!=${nextHorizon}`,
          );
        }
      }
      if (failures.length === 0) {
        if (!closeoutRunCloseoutGate.reported) {
          failures.push("closeout_run_horizon_closeout_gate_not_reported");
          if (sourceHorizon === "H2") {
            failures.push("closeout_run_h2_closeout_gate_not_reported");
          }
        } else if (!closeoutRunCloseoutGate.pass) {
          failures.push("closeout_run_horizon_closeout_gate_not_passed");
          if (sourceHorizon === "H2") {
            failures.push("closeout_run_h2_closeout_gate_not_passed");
          }
        } else if (!closeoutRunStageGoalPolicySignals.validationReported) {
          failures.push("closeout_run_supervised_simulation_stage_goal_policy_propagation_not_reported");
        } else if (!closeoutRunStageGoalPolicySignals.sourceConsistencyReported) {
          failures.push(
            "closeout_run_supervised_simulation_stage_goal_policy_source_consistency_not_reported",
          );
        } else if (!closeoutRunStageGoalPolicySignals.validationPass) {
          failures.push("closeout_run_supervised_simulation_stage_goal_policy_propagation_not_passed");
        } else if (!closeoutRunStageGoalPolicySignals.sourceConsistencyPass) {
          failures.push(
            "closeout_run_supervised_simulation_stage_goal_policy_source_consistency_not_passed",
          );
        }
      }
      if (!closeoutRunPathSignals.hasAny) {
        failures.push("closeout_run_missing_closeout_out");
      } else if (!closeoutRunPathSignals.allAligned) {
        failures.push("closeout_run_closeout_out_alias_conflict");
      } else {
        closeoutFile = closeoutRunPathSignals.resolvedPath;
      }
    }
  }

  let closeoutCommand = null;
  let progressiveGoalsCommand = null;
  let goalPolicyCoverageCommand = null;
  let goalPolicyFileValidationCommand = null;
  let goalPolicyReadinessAuditCommand = null;
  let closeoutPayload = null;
  let progressiveGoalsPayload = null;
  let goalPolicyCoveragePayload = null;
  let goalPolicyFileValidationPayload = null;
  let goalPolicyReadinessAuditPayload = null;
  let closeoutSchemaValidation = { valid: false, errors: ["closeout_not_loaded"] };
  let closeoutTransition = {
    source: null,
    next: null,
    sourceReported: false,
    nextReported: false,
    sourceInvalid: false,
    nextInvalid: false,
    sourceInvalidValues: [],
    nextInvalidValues: [],
    sourceAliasConflict: false,
    nextAliasConflict: false,
    sourceAliases: [],
    nextAliases: [],
    sourceMatches: false,
    nextMatches: false,
  };
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
    closeoutSchemaValidation = validateManifestSchema("horizon-closeout", closeoutPayload);
    if (!closeoutSchemaValidation.valid) {
      failures.push(...closeoutSchemaValidation.errors.map((error) => `closeout_schema_invalid:${error}`));
    }
    if (closeoutPayload?.pass !== true) {
      failures.push("closeout_not_passed");
    }
    closeoutTransition = resolveCloseoutTransition(closeoutPayload, sourceHorizon, nextHorizon);
    if (sourceHorizon && nextHorizon) {
      if (closeoutTransition.sourceInvalid) {
        failures.push("closeout_horizon_source_invalid");
      } else if (!closeoutTransition.sourceReported) {
        failures.push("closeout_horizon_source_not_reported");
      } else if (closeoutTransition.sourceAliasConflict) {
        failures.push("closeout_horizon_source_alias_conflict");
      } else if (!closeoutTransition.sourceMatches) {
        failures.push(`closeout_horizon_source_mismatch:${String(closeoutTransition.source)}!=${sourceHorizon}`);
      }
      if (closeoutTransition.nextInvalid) {
        failures.push("closeout_horizon_next_invalid");
      } else if (!closeoutTransition.nextReported) {
        failures.push("closeout_horizon_next_not_reported");
      } else if (closeoutTransition.nextAliasConflict) {
        failures.push("closeout_horizon_next_alias_conflict");
      } else if (!closeoutTransition.nextMatches) {
        failures.push(`closeout_horizon_next_mismatch:${String(closeoutTransition.next)}!=${nextHorizon}`);
      }
    }
  }
  if (closeoutCommand && closeoutCommand.code !== 0) {
    failures.push(`closeout_command_failed:${String(closeoutCommand.code)}`);
  }
  if (
    closeoutRunPayload &&
    closeoutRunTransition.sourceReported &&
    closeoutTransition.sourceReported &&
    closeoutRunTransition.source !== closeoutTransition.source
  ) {
    failures.push(
      `closeout_run_closeout_horizon_source_disagreement:${String(closeoutRunTransition.source)}!=${String(closeoutTransition.source)}`,
    );
  }
  if (
    closeoutRunPayload &&
    closeoutRunTransition.nextReported &&
    closeoutTransition.nextReported &&
    closeoutRunTransition.next !== closeoutTransition.next
  ) {
    failures.push(
      `closeout_run_closeout_horizon_next_disagreement:${String(closeoutRunTransition.next)}!=${String(closeoutTransition.next)}`,
    );
  }
  if (failures.length === 0 && options.requireGoalPolicyFileValidation) {
    const policyValidationUntilHorizon = normalizeHorizon(
      options.goalPolicyFileValidationUntilHorizon,
      nextHorizon || "H12",
    );
    const goalPolicyFileValidationArgv = [
      "node",
      "scripts/validate-goal-policy-file.mjs",
      "--horizon-status-file",
      horizonStatusFile,
      "--source-horizon",
      sourceHorizon,
      "--until-horizon",
      policyValidationUntilHorizon,
      "--out",
      goalPolicyFileValidationOut,
    ];
    if (isNonEmptyString(resolvedGoalPolicyFile)) {
      goalPolicyFileValidationArgv.push("--goal-policy-file", resolvedGoalPolicyFile);
    }
    if (isNonEmptyString(options.requiredPolicyTransitions)) {
      goalPolicyFileValidationArgv.push("--required-policy-transitions", options.requiredPolicyTransitions);
    }
    if (!options.requirePolicyTaggedTargets) {
      goalPolicyFileValidationArgv.push("--allow-untagged-requirements");
    }
    if (!options.requirePositivePendingPolicyMin) {
      goalPolicyFileValidationArgv.push("--allow-zero-pending-min");
    }
    if (options.allowGoalPolicyFileValidationFallback) {
      goalPolicyFileValidationArgv.push("--allow-fallback-source");
    }
    goalPolicyFileValidationCommand = await runCommand(goalPolicyFileValidationArgv, {
      timeoutMs: options.timeoutMs,
    });
    goalPolicyFileValidationPayload = await readJson(goalPolicyFileValidationOut);
    if (
      goalPolicyFileValidationCommand.code !== 0 ||
      goalPolicyFileValidationPayload?.pass !== true
    ) {
      failures.push("goal_policy_file_validation_gate_failed");
    }
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
    if (isNonEmptyString(resolvedGoalPolicyFile)) {
      progressiveGoalsArgv.push("--goal-policy-file", resolvedGoalPolicyFile);
    }
    progressiveGoalsCommand = await runCommand(progressiveGoalsArgv, { timeoutMs: options.timeoutMs });
    progressiveGoalsPayload = await readJson(progressiveGoalsOut);
    if (progressiveGoalsCommand.code !== 0 || progressiveGoalsPayload?.pass !== true) {
      failures.push("progressive_goals_gate_failed");
    }
  }
  if (failures.length === 0 && options.requireGoalPolicyCoverage) {
    const coverageUntilHorizon = normalizeHorizon(
      options.goalPolicyCoverageUntilHorizon,
      "H12",
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
    if (isNonEmptyString(resolvedGoalPolicyFile)) {
      goalPolicyCoverageArgv.push("--goal-policy-file", resolvedGoalPolicyFile);
    }
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
      nextHorizon || "H12",
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
    if (isNonEmptyString(resolvedGoalPolicyFile)) {
      goalPolicyReadinessAuditArgv.push("--goal-policy-file", resolvedGoalPolicyFile);
    }
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
      goalPolicySource: goalPolicySource.source,
      goalPolicyFile: resolvedGoalPolicyFile,
      evidenceDir: options.closeoutFile ? null : evidenceDir,
      closeoutFile,
      closeoutOut: options.closeoutFile ? null : closeoutOut,
      closeoutRunFile: closeoutRunFile || null,
      progressiveGoalsOut: options.requireProgressiveGoals ? progressiveGoalsOut : null,
      goalPolicyCoverageOut: options.requireGoalPolicyCoverage ? goalPolicyCoverageOut : null,
      goalPolicyFileValidationOut: options.requireGoalPolicyFileValidation
        ? goalPolicyFileValidationOut
        : null,
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
      closeoutSourceHorizon: closeoutTransition.source,
      closeoutNextHorizon: closeoutTransition.next,
      closeoutHorizonSourceReported: closeoutTransition.sourceReported,
      closeoutHorizonNextReported: closeoutTransition.nextReported,
      closeoutHorizonSourceMatches: closeoutTransition.sourceMatches,
      closeoutHorizonNextMatches: closeoutTransition.nextMatches,
      closeoutRunPass: closeoutRunPayload?.pass === true,
      closeoutRunSourceHorizon: closeoutRunTransition.source,
      closeoutRunNextHorizon: closeoutRunTransition.next,
      closeoutRunHorizonSourceReported: closeoutRunTransition.sourceReported,
      closeoutRunHorizonNextReported: closeoutRunTransition.nextReported,
      closeoutRunHorizonSourceInvalid: closeoutRunTransition.sourceInvalid,
      closeoutRunHorizonNextInvalid: closeoutRunTransition.nextInvalid,
      closeoutRunHorizonSourceInvalidValues:
        closeoutRunTransition.sourceInvalidValues.length > 0
          ? closeoutRunTransition.sourceInvalidValues
          : null,
      closeoutRunHorizonNextInvalidValues:
        closeoutRunTransition.nextInvalidValues.length > 0
          ? closeoutRunTransition.nextInvalidValues
          : null,
      closeoutRunHorizonSourceAliasConflict: closeoutRunTransition.sourceAliasConflict,
      closeoutRunHorizonNextAliasConflict: closeoutRunTransition.nextAliasConflict,
      closeoutRunHorizonSourceMatches: closeoutRunTransition.sourceMatches,
      closeoutRunHorizonNextMatches: closeoutRunTransition.nextMatches,
      closeoutHorizonSourceInvalid: closeoutTransition.sourceInvalid,
      closeoutHorizonNextInvalid: closeoutTransition.nextInvalid,
      closeoutHorizonSourceInvalidValues:
        closeoutTransition.sourceInvalidValues.length > 0
          ? closeoutTransition.sourceInvalidValues
          : null,
      closeoutHorizonNextInvalidValues:
        closeoutTransition.nextInvalidValues.length > 0
          ? closeoutTransition.nextInvalidValues
          : null,
      closeoutHorizonSourceAliasConflict: closeoutTransition.sourceAliasConflict,
      closeoutHorizonNextAliasConflict: closeoutTransition.nextAliasConflict,
      closeoutRunCloseoutOutAliasesConsistent:
        closeoutRunPathSignals.hasAny ? closeoutRunPathSignals.allAligned : null,
      closeoutRunCloseoutTransitionSourceMatches:
        closeoutRunTransition.sourceReported && closeoutTransition.sourceReported
          ? closeoutRunTransition.source === closeoutTransition.source
          : null,
      closeoutRunCloseoutTransitionNextMatches:
        closeoutRunTransition.nextReported && closeoutTransition.nextReported
          ? closeoutRunTransition.next === closeoutTransition.next
          : null,
      closeoutRunCloseoutGateReported: closeoutRunCloseoutGate.reported,
      closeoutRunCloseoutGatePass: closeoutRunCloseoutGate.pass,
      closeoutRunH2CloseoutGateReported: closeoutRunH2CloseoutGate.reported,
      closeoutRunH2CloseoutGatePass: closeoutRunH2CloseoutGate.pass,
      closeoutRunSupervisedSimulationPass:
        closeoutRunPayload?.checks?.supervisedSimulationPass === true,
      closeoutRunSupervisedSimulationStageGoalPolicyPropagationReported:
        closeoutRunStageGoalPolicySignals.reported,
      closeoutRunSupervisedSimulationStageGoalPolicyPropagationPassed:
        closeoutRunStageGoalPolicySignals.pass,
      closeoutRunSupervisedSimulationStageGoalPolicyPropagationPass:
        closeoutRunStageGoalPolicySignals.pass,
      closeoutRunSupervisedSimulationStageGoalPolicyValidationPropagationReported:
        closeoutRunStageGoalPolicySignals.validationReported,
      closeoutRunSupervisedSimulationStageGoalPolicyValidationPropagationPassed:
        closeoutRunStageGoalPolicySignals.validationPass,
      closeoutRunSupervisedSimulationStageGoalPolicySourceConsistencyPropagationReported:
        closeoutRunStageGoalPolicySignals.sourceConsistencyReported,
      closeoutRunSupervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed:
        closeoutRunStageGoalPolicySignals.sourceConsistencyPass,
      closeoutRunSchemaValid: closeoutRunSchemaValidation.valid,
      closeoutRunSchemaErrors:
        closeoutRunSchemaValidation.valid || closeoutRunSchemaValidation.errors.length === 0
          ? null
          : closeoutRunSchemaValidation.errors,
      closeoutSchemaValid: closeoutSchemaValidation.valid,
      closeoutSchemaErrors:
        closeoutSchemaValidation.valid || closeoutSchemaValidation.errors.length === 0
          ? null
          : closeoutSchemaValidation.errors,
      requireProgressiveGoals: options.requireProgressiveGoals,
      strictGoalPolicyGates: options.strictGoalPolicyGates,
      requireGoalPolicySourceConsistency: options.requireGoalPolicySourceConsistency,
      goalPolicySource: goalPolicySource.source,
      goalPolicyFile: resolvedGoalPolicyFile,
      goalPolicySourceConsistencyChecked: goalPolicySource.crossSourceConsistencyChecked === true,
      goalPolicySourceConsistencyPass:
        goalPolicySource.crossSourceConsistencyChecked === true
          ? goalPolicySource.crossSourceConsistencyPass === true
          : null,
      goalPolicySourceConsistencyOverlapTransitions:
        Array.isArray(goalPolicySource.crossSourceOverlapTransitionKeys) &&
        goalPolicySource.crossSourceOverlapTransitionKeys.length > 0
          ? goalPolicySource.crossSourceOverlapTransitionKeys
          : null,
      goalPolicySourceConsistencyConflictTransitions:
        Array.isArray(goalPolicySource.crossSourceConflictTransitionKeys) &&
        goalPolicySource.crossSourceConflictTransitionKeys.length > 0
          ? goalPolicySource.crossSourceConflictTransitionKeys
          : null,
      goalPolicyKey:
        options.requireProgressiveGoals === true
          ? String(options.goalPolicyKey ?? "").trim() || null
          : null,
      requireGoalPolicyCoverage: options.requireGoalPolicyCoverage,
      goalPolicyCoverageUntilHorizon:
        options.requireGoalPolicyCoverage === true
          ? normalizeHorizon(options.goalPolicyCoverageUntilHorizon, nextHorizon || "H12") || null
          : null,
      requiredPolicyTransitions:
        options.requireGoalPolicyCoverage === true && isNonEmptyString(options.requiredPolicyTransitions)
          ? String(options.requiredPolicyTransitions ?? "").trim()
          : null,
      goalPolicyCoveragePass:
        options.requireGoalPolicyCoverage === true
          ? goalPolicyCoveragePayload?.pass === true
          : null,
      requireGoalPolicyFileValidation: options.requireGoalPolicyFileValidation,
      goalPolicyFileValidationPass:
        options.requireGoalPolicyFileValidation === true
          ? goalPolicyFileValidationPayload?.pass === true
          : null,
      goalPolicyFileValidationUntilHorizon:
        options.requireGoalPolicyFileValidation === true
          ? normalizeHorizon(options.goalPolicyFileValidationUntilHorizon, nextHorizon || "H12") || null
          : null,
      allowGoalPolicyFileValidationFallback: options.allowGoalPolicyFileValidationFallback,
      requireGoalPolicyReadinessAudit: options.requireGoalPolicyReadinessAudit,
      goalPolicyReadinessAuditPass:
        options.requireGoalPolicyReadinessAudit === true
          ? goalPolicyReadinessAuditPayload?.pass === true
          : null,
      goalPolicyReadinessAuditUntilHorizon:
        options.requireGoalPolicyReadinessAudit === true
          ? normalizeHorizon(options.goalPolicyReadinessAuditUntilHorizon, nextHorizon || "H12") || null
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
      goalPolicyFileValidation: goalPolicyFileValidationCommand,
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
