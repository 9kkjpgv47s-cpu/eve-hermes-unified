#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { resolveGoalPolicySource } from "./goal-policy-source.mjs";
import { validateManifestSchema } from "./validate-manifest-schema.mjs";

const HORIZON_SEQUENCE = [
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "H7",
  "H8",
  "H9",
  "H10",
  "H11",
  "H12",
  "H13",
  "H14",
  "H15",
  "H16",
  "H17",
  "H18",
];

function parseArgs(argv) {
  const options = {
    evidenceDir: "",
    horizonStatusFile: "",
    envFile: "",
    out: "",
    horizon: "H2",
    stage: "",
    currentStage: "",
    nextHorizon: "",
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
    requireGoalPolicyValidation: false,
    goalPolicyValidationOut: "",
    goalPolicyValidationUntilHorizon: "H12",
    goalPolicyValidationUntilExplicit: false,
    allowGoalPolicyValidationFallback: false,
    requireGoalPolicyCoverage: false,
    goalPolicyCoverageOut: "",
    goalPolicyCoverageUntilHorizon: "H12",
    goalPolicyCoverageUntilExplicit: false,
    requiredPolicyTransitions: "",
    requirePolicyTaggedTargets: false,
    requirePositivePendingPolicyMin: false,
    requireGoalPolicyReadinessAudit: false,
    goalPolicyReadinessAuditOut: "",
    goalPolicyReadinessAuditUntilHorizon: "H12",
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
    } else if (arg === "--horizon") {
      options.horizon = value ?? "";
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
    } else if (
      arg === "--require-goal-policy-validation" ||
      arg === "--require-goal-policy-file-validation"
    ) {
      options.requireGoalPolicyValidation = true;
    } else if (
      arg === "--goal-policy-validation-out" ||
      arg === "--goal-policy-file-validation-out"
    ) {
      options.goalPolicyValidationOut = value ?? "";
      index += 1;
    } else if (
      arg === "--goal-policy-validation-until-horizon" ||
      arg === "--goal-policy-file-validation-until-horizon" ||
      arg === "--goal-policy-file-validation-max-target-horizon"
    ) {
      options.goalPolicyValidationUntilHorizon = value ?? "";
      options.goalPolicyValidationUntilExplicit = true;
      index += 1;
    } else if (
      arg === "--allow-goal-policy-validation-fallback" ||
      arg === "--allow-goal-policy-file-validation-fallback"
    ) {
      options.allowGoalPolicyValidationFallback = true;
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

function deriveDefaultTargetStage(sourceHorizon) {
  if (sourceHorizon === "H2") {
    return "majority";
  }
  if (sourceHorizon === "H3" || sourceHorizon === "H4") {
    return "full";
  }
  return "majority";
}

function deriveDefaultCurrentStage(sourceHorizon) {
  if (sourceHorizon === "H2") {
    return "canary";
  }
  if (sourceHorizon === "H3") {
    return "majority";
  }
  return "full";
}

function closeoutRunFailureCode(sourceHorizon, detail) {
  return sourceHorizon === "H2"
    ? `h2_closeout_run_${detail}`
    : `horizon_closeout_run_${sourceHorizon.toLowerCase()}_${detail}`;
}

function closeoutRunFailureCodes(sourceHorizon, detail) {
  const canonical = `horizon_closeout_run_${detail}`;
  const scoped = closeoutRunFailureCode(sourceHorizon, detail);
  if (canonical === scoped) {
    return [canonical];
  }
  return [canonical, scoped];
}

function addCloseoutRunFailure(failures, sourceHorizon, detail, reason = "") {
  const normalizedReason = String(reason ?? "").trim();
  for (const code of closeoutRunFailureCodes(sourceHorizon, detail)) {
    failures.push(normalizedReason.length > 0 ? `${code}:${normalizedReason}` : code);
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

function resolveCloseoutRunSimulationSignals(closeoutRunPayload) {
  const checks =
    closeoutRunPayload?.checks && typeof closeoutRunPayload.checks === "object"
      ? closeoutRunPayload.checks
      : {};
  const closeoutGateReported =
    typeof checks.h2CloseoutGatePass === "boolean" ||
    typeof checks.horizonCloseoutGatePass === "boolean";
  const closeoutGatePass = resolveBooleanCandidate(checks, [
    "h2CloseoutGatePass",
    "horizonCloseoutGatePass",
  ]);
  const supervisedSimulationPass = resolveBooleanCandidate(checks, [
    "supervisedSimulationPass",
  ]);
  const validationPropagationReported = resolveBooleanCandidate(checks, [
    "supervisedSimulationStageGoalPolicyPropagationReported",
    "supervisedSimulationStageGoalPolicyValidationPropagationReported",
    "supervisedSimulationStagePolicySignalsReported",
  ]);
  const validationPropagationPassed = resolveBooleanCandidate(checks, [
    "supervisedSimulationStageGoalPolicyPropagationPassed",
    "supervisedSimulationStageGoalPolicyPropagationPass",
    "supervisedSimulationStageGoalPolicyValidationPropagationPassed",
    "supervisedSimulationStagePolicySignalsPass",
  ]);
  const sourceConsistencyPropagationReported = resolveBooleanCandidate(checks, [
    "supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported",
    "supervisedSimulationStageSourceConsistencySignalsReported",
  ]);
  const sourceConsistencyPropagationPassed = resolveBooleanCandidate(checks, [
    "supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed",
    "supervisedSimulationStageSourceConsistencySignalsPass",
  ]);
  const propagationReported =
    validationPropagationReported && sourceConsistencyPropagationReported;
  const propagationPassed =
    validationPropagationPassed && sourceConsistencyPropagationPassed;
  return {
    closeoutGateReported,
    closeoutGatePass,
    // Backward-compatible aliases used by H2 checks/tests.
    h2CloseoutGateReported: closeoutGateReported,
    h2CloseoutGatePass: closeoutGatePass,
    validationPropagationReported,
    validationPropagationPassed,
    sourceConsistencyPropagationReported,
    sourceConsistencyPropagationPassed,
    propagationReported,
    propagationPassed,
    supervisedSimulationPass,
  };
}

function resolveCloseoutRunTransition(closeoutRunPayload, expectedSource, expectedNext) {
  const checks =
    closeoutRunPayload?.checks && typeof closeoutRunPayload.checks === "object"
      ? closeoutRunPayload.checks
      : {};
  const horizonPayload =
    closeoutRunPayload?.horizon && typeof closeoutRunPayload.horizon === "object"
      ? closeoutRunPayload.horizon
      : {};
  const sourceSignals = resolveHorizonAliasSignals([
    horizonPayload.source,
    horizonPayload.current,
    horizonPayload.from,
    closeoutRunPayload?.sourceHorizon,
    checks.sourceHorizon,
  ]);
  const nextSignals = resolveHorizonAliasSignals([
    horizonPayload.next,
    horizonPayload.nextHorizon,
    horizonPayload.to,
    closeoutRunPayload?.nextHorizon,
    checks.nextHorizon,
  ]);
  const normalizedSource = sourceSignals.value;
  const inferredSource =
    !normalizedSource &&
    (typeof checks.h2CloseoutGatePass === "boolean" ||
      typeof checks.horizonCloseoutGatePass === "boolean")
      ? expectedSource
      : "";
  const effectiveSource = normalizedSource || inferredSource;
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
    sourceCandidates: sourceSignals.values,
    nextCandidates: nextSignals.values,
    sourceMatches: sourceReported && effectiveSource === expectedSource,
    nextMatches: nextReported && normalizedNext === expectedNext,
  };
}

function resolveHorizonAliasSignals(entries) {
  const rawValues = entries
    .filter((value) => typeof value === "string" || typeof value === "number")
    .map((value) => String(value ?? "").trim())
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

function resolveCloseoutRunCloseoutArtifactPath(closeoutRunPayload, closeoutRunManifestPath = "") {
  const files =
    closeoutRunPayload?.files && typeof closeoutRunPayload.files === "object"
      ? closeoutRunPayload.files
      : {};
  const manifestBaseDir = isNonEmptyString(closeoutRunManifestPath)
    ? path.dirname(path.resolve(closeoutRunManifestPath))
    : process.cwd();
  const rawCandidates = [files.closeoutOut, files.closeoutFile, closeoutRunPayload?.closeoutOut]
    .map((value) => (isNonEmptyString(value) ? String(value).trim() : ""))
    .filter((value) => value.length > 0);
  const resolvedCandidates = Array.from(
    new Set(rawCandidates.map((candidate) => path.resolve(manifestBaseDir, candidate))),
  );
  return {
    path: resolvedCandidates[0] ?? "",
    reported: resolvedCandidates.length > 0,
    conflict: resolvedCandidates.length > 1,
    resolvedCandidates,
  };
}

function resolveCloseoutArtifactTransition(closeoutPayload) {
  const closeout =
    closeoutPayload?.closeout && typeof closeoutPayload.closeout === "object"
      ? closeoutPayload.closeout
      : {};
  const payloadHorizon =
    closeoutPayload?.horizon && typeof closeoutPayload.horizon === "object"
      ? closeoutPayload.horizon
      : {};
  const checks =
    closeoutPayload?.checks && typeof closeoutPayload.checks === "object"
      ? closeoutPayload.checks
      : {};
  const nextHorizonCheck =
    checks?.nextHorizon && typeof checks.nextHorizon === "object" ? checks.nextHorizon : {};
  const sourceSignals = resolveHorizonAliasSignals([
    closeout.horizon,
    closeout.sourceHorizon,
    payloadHorizon.source,
  ]);
  const nextSignals = resolveHorizonAliasSignals([
    closeout.nextHorizon,
    closeout.targetNextHorizon,
    payloadHorizon.next,
    nextHorizonCheck.selectedNextHorizon,
    checks.nextHorizon,
  ]);
  return {
    source: sourceSignals.value,
    next: nextSignals.value,
    sourceReported: sourceSignals.reported,
    nextReported: nextSignals.reported,
    sourceInvalid: sourceSignals.invalid,
    nextInvalid: nextSignals.invalid,
    sourceInvalidValues: sourceSignals.invalidValues,
    nextInvalidValues: nextSignals.invalidValues,
    sourceAliasConflict: sourceSignals.conflict,
    nextAliasConflict: nextSignals.conflict,
    sourceCandidates: sourceSignals.values,
    nextCandidates: nextSignals.values,
  };
}

function resolveTransitionAlignmentSignals(closeoutRunTransition, closeoutArtifactTransition) {
  const sourceComparable =
    closeoutRunTransition.sourceReported && closeoutArtifactTransition.sourceReported;
  const nextComparable = closeoutRunTransition.nextReported && closeoutArtifactTransition.nextReported;
  return {
    sourceComparable,
    nextComparable,
    sourceAligned:
      sourceComparable && closeoutRunTransition.source === closeoutArtifactTransition.source,
    nextAligned:
      nextComparable && closeoutRunTransition.next === closeoutArtifactTransition.next,
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
  const sourceHorizon = normalizeHorizon(options.horizon, "H2");
  const derivedNextHorizon = deriveNextHorizon(sourceHorizon);
  const stage = normalizeStage(options.stage, deriveDefaultTargetStage(sourceHorizon));
  const currentStage = normalizeStage(options.currentStage, deriveDefaultCurrentStage(sourceHorizon));
  const nextHorizon = normalizeHorizon(options.nextHorizon, derivedNextHorizon || "H3");
  const goalPolicySource = await resolveGoalPolicySource({
    goalPolicyFile: options.goalPolicyFile,
    horizonStatusFile,
    requireGoalPolicySourceConsistency: options.strictGoalPolicyGates,
  });
  const resolvedGoalPolicyFile = isNonEmptyString(goalPolicySource.goalPolicyFile)
    ? path.resolve(goalPolicySource.goalPolicyFile)
    : null;
  const evidenceSelectionMode = normalizeEvidenceSelectionMode(
    options.evidenceSelectionMode,
    "latest-passing",
  );
  const runPrefix =
    sourceHorizon === "H2" ? "h2-promotion-run" : `horizon-promotion-run-${sourceHorizon}`;
  const closeoutRunPrefix =
    sourceHorizon === "H2" ? "h2-closeout-run" : `horizon-closeout-run-${sourceHorizon}`;
  const closeoutRunManifestType = sourceHorizon === "H2" ? "h2-closeout-run" : "horizon-closeout-run";

  const outPath = path.resolve(
    options.out || path.join(evidenceDir, `${runPrefix}-${runStamp}.json`),
  );
  const closeoutRunOut = path.resolve(
    options.closeoutRunOut || path.join(evidenceDir, `${closeoutRunPrefix}-${runStamp}.json`),
  );
  const horizonPromotionOut = path.resolve(
    options.horizonPromotionOut ||
      path.join(evidenceDir, `horizon-promotion-${sourceHorizon}-to-${nextHorizon}-${runStamp}.json`),
  );
  const progressiveGoalsOut = path.resolve(
    options.progressiveGoalsOut ||
      path.join(evidenceDir, `progressive-horizon-goals-${sourceHorizon}-to-${nextHorizon}-${runStamp}.json`),
  );
  const goalPolicyCoverageOut = path.resolve(
    options.goalPolicyCoverageOut ||
      path.join(evidenceDir, `goal-policy-coverage-${sourceHorizon}-to-${nextHorizon}-${runStamp}.json`),
  );
  const goalPolicyReadinessAuditOut = path.resolve(
    options.goalPolicyReadinessAuditOut ||
      path.join(evidenceDir, `goal-policy-readiness-${sourceHorizon}-to-${nextHorizon}-${runStamp}.json`),
  );
  const goalPolicyValidationOut = path.resolve(
    options.goalPolicyValidationOut ||
      path.join(evidenceDir, `goal-policy-file-validation-${sourceHorizon}-to-${nextHorizon}-${runStamp}.json`),
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
  if (
    Number.isFinite(options.minimumGoalIncrease) &&
    (!Number.isInteger(options.minimumGoalIncrease) || options.minimumGoalIncrease < 1)
  ) {
    failures.push(`invalid_minimum_goal_increase:${String(options.minimumGoalIncrease)}`);
  }
  if (options.strictGoalPolicyGates) {
    options.requireGoalPolicyValidation = true;
    options.allowGoalPolicyValidationFallback = true;
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
    if (!options.goalPolicyValidationUntilExplicit) {
      options.goalPolicyValidationUntilHorizon = nextHorizon;
    }
    if (!isNonEmptyString(options.requiredPolicyTransitions)) {
      options.requiredPolicyTransitions = `${sourceHorizon}->${nextHorizon}`;
    }
    if (!isNonEmptyString(options.goalPolicyKey)) {
      options.goalPolicyKey = `${sourceHorizon}->${nextHorizon}`;
    }
  }

  let closeoutRunCommand = null;
  let closeoutRunPayload = null;
  let closeoutRunSchemaValidation = { valid: false, errors: ["closeout_run_not_loaded"] };
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
    sourceCandidates: [],
    nextCandidates: [],
    sourceMatches: false,
    nextMatches: false,
  };
  let closeoutArtifactReference = {
    path: "",
    reported: false,
    conflict: false,
    resolvedCandidates: [],
  };
  let closeoutArtifactPayload = null;
  let closeoutArtifactPass = false;
  let closeoutArtifactSchemaValidation = { valid: false, errors: ["closeout_artifact_not_loaded"] };
  let closeoutArtifactTransition = {
    source: "",
    next: "",
    sourceReported: false,
    nextReported: false,
    sourceInvalid: false,
    nextInvalid: false,
    sourceInvalidValues: [],
    nextInvalidValues: [],
    sourceAliasConflict: false,
    nextAliasConflict: false,
    sourceCandidates: [],
    nextCandidates: [],
    sourceMatches: false,
    nextMatches: false,
  };
  let closeoutTransitionAlignment = {
    sourceComparable: false,
    nextComparable: false,
    sourceAligned: false,
    nextAligned: false,
  };
  let closeoutRunSimulationSignals = {
    h2CloseoutGateReported: false,
    h2CloseoutGatePass: false,
    propagationReported: false,
    propagationPassed: false,
    supervisedSimulationPass: false,
  };
  let horizonPromotionCommand = null;
  let horizonPromotionPayload = null;
  let horizonPromotionSchemaValidation = { valid: false, errors: ["horizon_promotion_not_loaded"] };

  if (failures.length === 0) {
    const closeoutRunOutPreExisted = await exists(closeoutRunOut);
    const closeoutRunArgv = [
      "node",
      "scripts/run-h2-closeout.mjs",
      "--horizon",
      sourceHorizon,
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

    if (closeoutRunOutPreExisted) {
      closeoutRunCommand = {
        argv: closeoutRunArgv,
        code: 0,
        signal: null,
        stdout: "",
        stderr: "",
        durationMs: 0,
        termination: "exit",
      };
    } else {
      closeoutRunCommand = await runCommand(closeoutRunArgv, {
        timeoutMs: options.timeoutMs,
        env: {
          UNIFIED_RUNTIME_ENV_FILE: envFile,
        },
      });
    }
    closeoutRunPayload = await readJsonMaybe(closeoutRunOut);
    closeoutRunSchemaValidation = validateManifestSchema(closeoutRunManifestType, closeoutRunPayload);
    if (!closeoutRunSchemaValidation.valid) {
      for (const error of closeoutRunSchemaValidation.errors) {
        addCloseoutRunFailure(failures, sourceHorizon, "schema_invalid", error);
      }
    }
    const forceMissingCloseoutRunSimulationSignals = resolveBooleanCandidate(process.env, [
      "UNIFIED_FORCE_MISSING_SIMULATION_STAGE_SIGNALS",
      "UNIFIED_FORCE_MISSING_SUPERVISED_SIMULATION_STAGE_SIGNALS",
    ]);
    if (
      forceMissingCloseoutRunSimulationSignals &&
      closeoutRunPayload?.checks &&
      typeof closeoutRunPayload.checks === "object"
    ) {
      closeoutRunPayload = {
        ...closeoutRunPayload,
        checks: {
          ...closeoutRunPayload.checks,
          supervisedSimulationStageGoalPolicyPropagationReported: false,
          supervisedSimulationStageGoalPolicyPropagationPassed: false,
          supervisedSimulationStageGoalPolicyPropagationPass: false,
          supervisedSimulationStagePolicySignalsReported: false,
          supervisedSimulationStagePolicySignalsPass: false,
        },
      };
    }
    closeoutRunTransition = resolveCloseoutRunTransition(closeoutRunPayload, sourceHorizon, nextHorizon);
    closeoutArtifactReference = resolveCloseoutRunCloseoutArtifactPath(
      closeoutRunPayload,
      closeoutRunOut,
    );
    closeoutRunSimulationSignals = resolveCloseoutRunSimulationSignals(closeoutRunPayload);
    if (closeoutRunCommand.code !== 0 || closeoutRunPayload?.pass !== true) {
      addCloseoutRunFailure(failures, sourceHorizon, "failed");
    } else if (closeoutRunTransition.sourceInvalid) {
      addCloseoutRunFailure(failures, sourceHorizon, "horizon_source_invalid");
    } else if (!closeoutRunTransition.sourceReported) {
      addCloseoutRunFailure(failures, sourceHorizon, "horizon_source_not_reported");
    } else if (closeoutRunTransition.sourceAliasConflict) {
      addCloseoutRunFailure(failures, sourceHorizon, "horizon_source_alias_conflict");
    } else if (!closeoutRunTransition.sourceMatches) {
      addCloseoutRunFailure(failures, sourceHorizon, "horizon_source_mismatch");
    } else if (closeoutRunTransition.nextInvalid) {
      addCloseoutRunFailure(failures, sourceHorizon, "horizon_next_invalid");
    } else if (!closeoutRunTransition.nextReported) {
      addCloseoutRunFailure(failures, sourceHorizon, "horizon_next_not_reported");
    } else if (closeoutRunTransition.nextAliasConflict) {
      addCloseoutRunFailure(failures, sourceHorizon, "horizon_next_alias_conflict");
    } else if (!closeoutRunTransition.nextMatches) {
      addCloseoutRunFailure(failures, sourceHorizon, "horizon_next_mismatch");
    } else if (closeoutArtifactReference.conflict) {
      addCloseoutRunFailure(failures, sourceHorizon, "conflicting_closeout_out_paths");
    } else if (!closeoutArtifactReference.reported) {
      addCloseoutRunFailure(failures, sourceHorizon, "missing_closeout_out");
    } else {
      closeoutArtifactPayload = await readJsonMaybe(closeoutArtifactReference.path);
      closeoutArtifactSchemaValidation = validateManifestSchema(
        "horizon-closeout",
        closeoutArtifactPayload,
      );
      closeoutArtifactPass = closeoutArtifactPayload?.pass === true;
      const closeoutArtifactResolved = resolveCloseoutArtifactTransition(closeoutArtifactPayload);
      closeoutArtifactTransition = {
        ...closeoutArtifactResolved,
        sourceMatches: closeoutArtifactResolved.sourceReported
          ? closeoutArtifactResolved.source === sourceHorizon
          : false,
        nextMatches: closeoutArtifactResolved.nextReported
          ? closeoutArtifactResolved.next === nextHorizon
          : false,
      };
      closeoutTransitionAlignment = resolveTransitionAlignmentSignals(
        closeoutRunTransition,
        closeoutArtifactTransition,
      );
      if (!closeoutArtifactPayload) {
        addCloseoutRunFailure(failures, sourceHorizon, "closeout_artifact_missing");
      } else if (!closeoutArtifactSchemaValidation.valid) {
        for (const error of closeoutArtifactSchemaValidation.errors) {
          addCloseoutRunFailure(
            failures,
            sourceHorizon,
            "closeout_artifact_schema_invalid",
            error,
          );
        }
      } else if (!closeoutArtifactPass) {
        addCloseoutRunFailure(failures, sourceHorizon, "closeout_artifact_not_passed");
      } else if (closeoutArtifactTransition.sourceInvalid) {
        addCloseoutRunFailure(failures, sourceHorizon, "closeout_artifact_horizon_source_invalid");
      } else if (!closeoutArtifactTransition.sourceReported) {
        addCloseoutRunFailure(failures, sourceHorizon, "closeout_artifact_horizon_source_not_reported");
      } else if (closeoutArtifactTransition.sourceAliasConflict) {
        addCloseoutRunFailure(
          failures,
          sourceHorizon,
          "closeout_artifact_horizon_source_alias_conflict",
        );
      } else if (!closeoutArtifactTransition.sourceMatches) {
        addCloseoutRunFailure(failures, sourceHorizon, "closeout_artifact_horizon_source_mismatch");
      } else if (closeoutArtifactTransition.nextInvalid) {
        addCloseoutRunFailure(failures, sourceHorizon, "closeout_artifact_horizon_next_invalid");
      } else if (!closeoutArtifactTransition.nextReported) {
        addCloseoutRunFailure(failures, sourceHorizon, "closeout_artifact_horizon_next_not_reported");
      } else if (closeoutArtifactTransition.nextAliasConflict) {
        addCloseoutRunFailure(
          failures,
          sourceHorizon,
          "closeout_artifact_horizon_next_alias_conflict",
        );
      } else if (!closeoutArtifactTransition.nextMatches) {
        addCloseoutRunFailure(failures, sourceHorizon, "closeout_artifact_horizon_next_mismatch");
      } else if (!closeoutTransitionAlignment.sourceComparable) {
        addCloseoutRunFailure(failures, sourceHorizon, "transition_source_alignment_not_comparable");
      } else if (!closeoutTransitionAlignment.sourceAligned) {
        addCloseoutRunFailure(failures, sourceHorizon, "transition_source_misaligned");
      } else if (!closeoutTransitionAlignment.nextComparable) {
        addCloseoutRunFailure(failures, sourceHorizon, "transition_next_alignment_not_comparable");
      } else if (!closeoutTransitionAlignment.nextAligned) {
        addCloseoutRunFailure(failures, sourceHorizon, "transition_next_misaligned");
      } else if (!closeoutRunSimulationSignals.h2CloseoutGateReported) {
        addCloseoutRunFailure(failures, sourceHorizon, "gate_not_reported");
      } else if (!closeoutRunSimulationSignals.h2CloseoutGatePass) {
        addCloseoutRunFailure(failures, sourceHorizon, "gate_not_passed");
      } else if (!closeoutRunSimulationSignals.validationPropagationReported) {
        addCloseoutRunFailure(failures, sourceHorizon, "missing_supervised_stage_goal_policy");
      } else if (!closeoutRunSimulationSignals.sourceConsistencyPropagationReported) {
        addCloseoutRunFailure(
          failures,
          sourceHorizon,
          "missing_supervised_stage_goal_policy_source_consistency",
        );
      } else if (!closeoutRunSimulationSignals.validationPropagationPassed) {
        addCloseoutRunFailure(failures, sourceHorizon, "supervised_stage_goal_policy_not_passed");
      } else if (!closeoutRunSimulationSignals.sourceConsistencyPropagationPassed) {
        addCloseoutRunFailure(
          failures,
          sourceHorizon,
          "supervised_stage_goal_policy_source_consistency_not_passed",
        );
      }
    }
  }

  if (failures.length === 0) {
    const promoteArgv = [
      "node",
      "scripts/promote-horizon.mjs",
      "--horizon",
      sourceHorizon,
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
    if (options.requireGoalPolicyValidation) {
      promoteArgv.push("--require-goal-policy-validation");
      promoteArgv.push("--goal-policy-validation-out", goalPolicyValidationOut);
      if (isNonEmptyString(options.goalPolicyValidationUntilHorizon)) {
        promoteArgv.push(
          "--goal-policy-validation-until-horizon",
          options.goalPolicyValidationUntilHorizon,
        );
      }
      if (options.allowGoalPolicyValidationFallback) {
        promoteArgv.push("--allow-goal-policy-validation-fallback");
      }
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
    horizonPromotionSchemaValidation = validateManifestSchema(
      "horizon-promotion",
      horizonPromotionPayload,
    );
    if (!horizonPromotionSchemaValidation.valid) {
      failures.push(
        ...horizonPromotionSchemaValidation.errors.map(
          (error) => `horizon_promotion_schema_invalid:${error}`,
        ),
      );
    }
    if (horizonPromotionCommand.code !== 0 || horizonPromotionPayload?.pass !== true) {
      failures.push("horizon_promotion_failed");
    }
  }

  const payload = {
    generatedAtIso: new Date().toISOString(),
    pass: failures.length === 0,
    horizon: {
      source: sourceHorizon,
      next: nextHorizon,
    },
    stage,
    dryRun: options.dryRun,
    files: {
      evidenceDir,
      horizonStatusFile,
      envFile,
      outPath,
      closeoutRunOut,
      closeoutRunCloseoutOut: closeoutArtifactReference.path || null,
      horizonPromotionOut,
      progressiveGoalsOut,
      goalPolicyValidationOut: options.requireGoalPolicyValidation ? goalPolicyValidationOut : null,
      goalPolicyCoverageOut: options.requireGoalPolicyCoverage ? goalPolicyCoverageOut : null,
      goalPolicyReadinessAuditOut: options.requireGoalPolicyReadinessAudit
        ? goalPolicyReadinessAuditOut
        : null,
    },
    checks: {
      evidenceSelectionMode,
      closeoutRunPass: closeoutRunPayload?.pass === true,
      closeoutGatePass:
        closeoutRunPayload?.checks?.h2CloseoutGatePass === true ||
        closeoutRunPayload?.checks?.horizonCloseoutGatePass === true,
      closeoutRunSourceHorizon: closeoutRunTransition.source,
      closeoutRunNextHorizon: closeoutRunTransition.next,
      closeoutRunSourceHorizonCandidates:
        closeoutRunTransition.sourceCandidates.length > 0 ? closeoutRunTransition.sourceCandidates : null,
      closeoutRunNextHorizonCandidates:
        closeoutRunTransition.nextCandidates.length > 0 ? closeoutRunTransition.nextCandidates : null,
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
      closeoutRunHorizonSourceMatches:
        closeoutRunTransition.sourceReported ? closeoutRunTransition.sourceMatches : null,
      closeoutRunHorizonNextMatches:
        closeoutRunTransition.nextReported ? closeoutRunTransition.nextMatches : null,
      closeoutRunCloseoutOutReported: closeoutArtifactReference.reported,
      closeoutRunCloseoutOutConflict: closeoutArtifactReference.conflict,
      closeoutRunCloseoutOutCandidates:
        closeoutArtifactReference.resolvedCandidates.length > 0
          ? closeoutArtifactReference.resolvedCandidates
          : null,
      closeoutRunCloseoutArtifactPass:
        closeoutArtifactPayload ? closeoutArtifactPass : null,
      closeoutRunCloseoutArtifactSourceHorizon:
        closeoutArtifactTransition.source.length > 0 ? closeoutArtifactTransition.source : null,
      closeoutRunCloseoutArtifactNextHorizon:
        closeoutArtifactTransition.next.length > 0 ? closeoutArtifactTransition.next : null,
      closeoutRunCloseoutArtifactHorizonSourceAliasConflict:
        closeoutArtifactTransition.sourceAliasConflict,
      closeoutRunCloseoutArtifactHorizonNextAliasConflict:
        closeoutArtifactTransition.nextAliasConflict,
      closeoutRunCloseoutArtifactHorizonSourceInvalid:
        closeoutArtifactTransition.sourceInvalid,
      closeoutRunCloseoutArtifactHorizonNextInvalid: closeoutArtifactTransition.nextInvalid,
      closeoutRunCloseoutArtifactHorizonSourceInvalidValues:
        closeoutArtifactTransition.sourceInvalidValues.length > 0
          ? closeoutArtifactTransition.sourceInvalidValues
          : null,
      closeoutRunCloseoutArtifactHorizonNextInvalidValues:
        closeoutArtifactTransition.nextInvalidValues.length > 0
          ? closeoutArtifactTransition.nextInvalidValues
          : null,
      closeoutRunCloseoutArtifactHorizonSourceMatches:
        closeoutArtifactTransition.sourceReported ? closeoutArtifactTransition.sourceMatches : null,
      closeoutRunCloseoutArtifactHorizonNextMatches:
        closeoutArtifactTransition.nextReported ? closeoutArtifactTransition.nextMatches : null,
      closeoutRunTransitionSourceAlignmentComparable:
        closeoutTransitionAlignment.sourceComparable,
      closeoutRunTransitionSourceAligned:
        closeoutTransitionAlignment.sourceComparable
          ? closeoutTransitionAlignment.sourceAligned
          : null,
      closeoutRunTransitionNextAlignmentComparable:
        closeoutTransitionAlignment.nextComparable,
      closeoutRunTransitionNextAligned:
        closeoutTransitionAlignment.nextComparable
          ? closeoutTransitionAlignment.nextAligned
          : null,
      closeoutRunH2CloseoutGateReported: closeoutRunSimulationSignals.h2CloseoutGateReported,
      closeoutRunH2CloseoutGatePass: closeoutRunSimulationSignals.h2CloseoutGatePass,
      closeoutRunCloseoutGateReported: closeoutRunSimulationSignals.closeoutGateReported,
      closeoutRunCloseoutGatePass: closeoutRunSimulationSignals.closeoutGatePass,
      closeoutRunSupervisedSimulationPass: closeoutRunSimulationSignals.supervisedSimulationPass,
      closeoutRunSupervisedSimulationStageGoalPolicyPropagationReported:
        closeoutRunSimulationSignals.propagationReported,
      closeoutRunSupervisedSimulationStageGoalPolicyPropagationPassed:
        closeoutRunSimulationSignals.propagationPassed,
      closeoutRunSupervisedSimulationStageGoalPolicyValidationPropagationReported:
        closeoutRunSimulationSignals.validationPropagationReported,
      closeoutRunSupervisedSimulationStageGoalPolicyValidationPropagationPassed:
        closeoutRunSimulationSignals.validationPropagationPassed,
      closeoutRunSupervisedSimulationStageGoalPolicySourceConsistencyPropagationReported:
        closeoutRunSimulationSignals.sourceConsistencyPropagationReported,
      closeoutRunSupervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed:
        closeoutRunSimulationSignals.sourceConsistencyPropagationPassed,
      closeoutRunSchemaValid: closeoutRunSchemaValidation.valid,
      closeoutRunSchemaErrors:
        closeoutRunSchemaValidation.valid || closeoutRunSchemaValidation.errors.length === 0
          ? null
          : closeoutRunSchemaValidation.errors,
      closeoutRunCloseoutArtifactSchemaValid: closeoutArtifactSchemaValidation.valid,
      closeoutRunCloseoutArtifactSchemaErrors:
        closeoutArtifactSchemaValidation.valid || closeoutArtifactSchemaValidation.errors.length === 0
          ? null
          : closeoutArtifactSchemaValidation.errors,
      horizonPromotionPass: horizonPromotionPayload?.pass === true,
      horizonPromotionSchemaValid: horizonPromotionSchemaValidation.valid,
      horizonPromotionSchemaErrors:
        horizonPromotionSchemaValidation.valid || horizonPromotionSchemaValidation.errors.length === 0
          ? null
          : horizonPromotionSchemaValidation.errors,
      horizonAdvanced: horizonPromotionPayload?.checks?.activeAdvanced === true,
      statusUpdated: horizonPromotionPayload?.checks?.statusUpdated === true,
      sourceHorizon,
      nextHorizon,
      requireCompletedActions: options.requireCompletedActions,
      requireActiveNextHorizon: options.requireActiveNextHorizon,
      progressiveGoalsPass: horizonPromotionPayload?.checks?.progressiveGoalsPass === true,
      requireProgressiveGoals: options.requireProgressiveGoals,
      minimumGoalIncrease: Number.isFinite(options.minimumGoalIncrease)
        ? options.minimumGoalIncrease
        : null,
      goalPolicyKey: isNonEmptyString(options.goalPolicyKey) ? options.goalPolicyKey : null,
      goalPolicyFile: resolvedGoalPolicyFile,
      goalPolicySourceConsistencyChecked:
        goalPolicySource.crossSourceConsistencyChecked === true,
      goalPolicySourceConsistencyPass:
        goalPolicySource.crossSourceConsistencyPass !== false,
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
      strictGoalPolicyGates: options.strictGoalPolicyGates,
      requireGoalPolicyValidation: options.requireGoalPolicyValidation,
      goalPolicyValidationPass:
        options.requireGoalPolicyValidation === true
          ? horizonPromotionPayload?.checks?.goalPolicyValidationPass === true
          : null,
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
    process.stderr.write(
      `Horizon promotion run failed (${sourceHorizon}->${nextHorizon}):\n- ${failures.join("\n- ")}\n`,
    );
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
