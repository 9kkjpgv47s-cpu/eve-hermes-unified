#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringOrNull(value) {
  return typeof value === "string" || value === null;
}

function isStringOrNullOrUndefined(value) {
  return typeof value === "string" || value === null || value === undefined;
}

function pushError(errors, condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function validateReleaseCommandEntry(entry, index, errors) {
  const prefix = `releaseCommandLogs[${String(index)}]`;
  pushError(errors, entry && typeof entry === "object", `${prefix} must be an object`);
  if (!entry || typeof entry !== "object") {
    return;
  }
  pushError(errors, isNonEmptyString(entry.command), `${prefix}.command must be a non-empty string`);
  pushError(errors, isNonEmptyString(entry.logFile), `${prefix}.logFile must be a non-empty string`);
  pushError(errors, Number.isFinite(entry.exitCode), `${prefix}.exitCode must be a finite number`);
  pushError(
    errors,
    entry.status === "passed" || entry.status === "failed",
    `${prefix}.status must be passed or failed`,
  );
}

function validateRequiredArtifact(entry, index, errors) {
  const prefix = `requiredArtifacts[${String(index)}]`;
  pushError(errors, entry && typeof entry === "object", `${prefix} must be an object`);
  if (!entry || typeof entry !== "object") {
    return;
  }
  pushError(errors, isNonEmptyString(entry.name), `${prefix}.name must be a non-empty string`);
  pushError(errors, typeof entry.present === "boolean", `${prefix}.present must be a boolean`);
  pushError(errors, isStringOrNull(entry.path), `${prefix}.path must be string or null`);
}

function validateCopiedArtifact(entry, index, errors) {
  const prefix = `copiedArtifacts[${String(index)}]`;
  pushError(errors, entry && typeof entry === "object", `${prefix} must be an object`);
  if (!entry || typeof entry !== "object") {
    return;
  }
  pushError(errors, isNonEmptyString(entry.source), `${prefix}.source must be non-empty string`);
  pushError(
    errors,
    isNonEmptyString(entry.destination),
    `${prefix}.destination must be non-empty string`,
  );
  pushError(
    errors,
    entry.kind === "file" || entry.kind === "directory",
    `${prefix}.kind must be file or directory`,
  );
}

export function validateReleaseReadinessManifest(payload) {
  const errors = [];
  pushError(errors, payload && typeof payload === "object", "payload must be an object");
  if (!payload || typeof payload !== "object") {
    return { valid: false, errors };
  }

  pushError(errors, payload.readinessVersion === "v1", "readinessVersion must be exactly v1");
  pushError(errors, isNonEmptyString(payload.generatedAtIso), "generatedAtIso must be non-empty string");
  pushError(errors, typeof payload.pass === "boolean", "pass must be boolean");
  pushError(
    errors,
    isNonEmptyString(payload.defaultValidationCommand),
    "defaultValidationCommand must be non-empty string",
  );

  const files = payload.files;
  pushError(errors, files && typeof files === "object", "files must be an object");
  if (files && typeof files === "object") {
    const requiredFileKeys = [
      "validationSummary",
      "regression",
      "cutoverReadiness",
      "failureInjection",
      "soak",
      "goalPolicyFileValidation",
      "commandLogDir",
      "commandsFile",
    ];
    for (const key of requiredFileKeys) {
      pushError(
        errors,
        isStringOrNullOrUndefined(files[key]),
        `files.${key} must be string, null, or undefined`,
      );
    }
  }

  pushError(errors, Array.isArray(payload.requiredArtifacts), "requiredArtifacts must be an array");
  if (Array.isArray(payload.requiredArtifacts)) {
    payload.requiredArtifacts.forEach((entry, index) => {
      validateRequiredArtifact(entry, index, errors);
    });
  }

  pushError(errors, Array.isArray(payload.releaseCommandLogs), "releaseCommandLogs must be an array");
  if (Array.isArray(payload.releaseCommandLogs)) {
    payload.releaseCommandLogs.forEach((entry, index) => {
      validateReleaseCommandEntry(entry, index, errors);
    });
  }

  const checks = payload.checks;
  pushError(errors, checks && typeof checks === "object", "checks must be an object");
  if (checks && typeof checks === "object") {
    const requiredBooleanChecks = [
      "validationSummaryPassed",
      "regressionPassed",
      "cutoverReadinessPassed",
      "validationCommandsPassed",
    ];
    for (const key of requiredBooleanChecks) {
      pushError(errors, typeof checks[key] === "boolean", `checks.${key} must be boolean`);
    }
    pushError(
      errors,
      checks.goalPolicyFileValidationPassed === undefined
        || typeof checks.goalPolicyFileValidationPassed === "boolean",
      "checks.goalPolicyFileValidationPassed must be boolean or undefined",
    );
    pushError(
      errors,
      checks.goalPolicySourceConsistencyReported === undefined
        || typeof checks.goalPolicySourceConsistencyReported === "boolean",
      "checks.goalPolicySourceConsistencyReported must be boolean or undefined",
    );
    pushError(
      errors,
      checks.goalPolicySourceConsistencyPassed === undefined
        || typeof checks.goalPolicySourceConsistencyPassed === "boolean",
      "checks.goalPolicySourceConsistencyPassed must be boolean or undefined",
    );
    pushError(
      errors,
      checks.goalPolicySourceConsistencyPass === undefined
        || typeof checks.goalPolicySourceConsistencyPass === "boolean",
      "checks.goalPolicySourceConsistencyPass must be boolean or undefined",
    );
    pushError(
      errors,
      checks.goalPolicySourceConsistencyConflictTransitions === undefined
        || checks.goalPolicySourceConsistencyConflictTransitions === null
        || Array.isArray(checks.goalPolicySourceConsistencyConflictTransitions),
      "checks.goalPolicySourceConsistencyConflictTransitions must be array, null, or undefined",
    );
    pushError(
      errors,
      checks.goalPolicySourceConsistencyOverlapTransitions === undefined
        || checks.goalPolicySourceConsistencyOverlapTransitions === null
        || Array.isArray(checks.goalPolicySourceConsistencyOverlapTransitions),
      "checks.goalPolicySourceConsistencyOverlapTransitions must be array, null, or undefined",
    );
    pushError(
      errors,
      Array.isArray(checks.requiredReleaseCommands),
      "checks.requiredReleaseCommands must be an array",
    );
    pushError(
      errors,
      Array.isArray(checks.missingRequiredCommands),
      "checks.missingRequiredCommands must be an array",
    );
    pushError(
      errors,
      Array.isArray(checks.executedReleaseCommands),
      "checks.executedReleaseCommands must be an array",
    );
    pushError(
      errors,
      Array.isArray(checks.missingCommandLogFiles),
      "checks.missingCommandLogFiles must be an array",
    );
    pushError(errors, Array.isArray(checks.commandFailures), "checks.commandFailures must be an array");
    pushError(errors, Array.isArray(checks.commandLogsMissing), "checks.commandLogsMissing must be an array");
    pushError(
      errors,
      Array.isArray(checks.discoveredCommandLogs),
      "checks.discoveredCommandLogs must be an array",
    );
  }

  pushError(errors, Array.isArray(payload.failures), "failures must be an array");
  return { valid: errors.length === 0, errors };
}

export function validateMergeBundleManifest(payload) {
  const errors = [];
  pushError(errors, payload && typeof payload === "object", "payload must be an object");
  if (!payload || typeof payload !== "object") {
    return { valid: false, errors };
  }

  pushError(errors, payload.bundleVersion === "v1", "bundleVersion must be exactly v1");
  pushError(errors, isNonEmptyString(payload.generatedAtIso), "generatedAtIso must be non-empty string");
  pushError(errors, typeof payload.pass === "boolean", "pass must be boolean");
  pushError(errors, isNonEmptyString(payload.evidenceDir), "evidenceDir must be non-empty string");
  pushError(errors, isNonEmptyString(payload.bundleDir), "bundleDir must be non-empty string");
  pushError(errors, isNonEmptyString(payload.archivePath), "archivePath must be non-empty string");

  const inputs = payload.inputs;
  pushError(errors, inputs && typeof inputs === "object", "inputs must be an object");
  if (inputs && typeof inputs === "object") {
    pushError(
      errors,
      isStringOrNull(inputs.releaseReadinessPath),
      "inputs.releaseReadinessPath must be string or null",
    );
    pushError(
      errors,
      isStringOrNull(inputs.initialScopePath),
      "inputs.initialScopePath must be string or null",
    );
  }

  const checks = payload.checks;
  pushError(errors, checks && typeof checks === "object", "checks must be an object");
  if (checks && typeof checks === "object") {
    const requiredBooleanChecks = [
      "releaseReadinessPassed",
      "initialScopePassed",
      "releaseValidationCommandsPassed",
      "releaseGoalPolicyValidationPassed",
      "initialScopeGoalPolicyValidationPassed",
    ];
    for (const key of requiredBooleanChecks) {
      pushError(errors, typeof checks[key] === "boolean", `checks.${key} must be boolean`);
    }
    pushError(
      errors,
      Array.isArray(checks.releaseFailures),
      "checks.releaseFailures must be an array",
    );
    pushError(
      errors,
      Array.isArray(checks.initialScopeFailures),
      "checks.initialScopeFailures must be an array",
    );
    pushError(
      errors,
      Array.isArray(checks.missingRequiredInputs),
      "checks.missingRequiredInputs must be an array",
    );
  }

  pushError(errors, Array.isArray(payload.copiedArtifacts), "copiedArtifacts must be an array");
  if (Array.isArray(payload.copiedArtifacts)) {
    payload.copiedArtifacts.forEach((entry, index) => {
      validateCopiedArtifact(entry, index, errors);
    });
  }
  pushError(errors, Array.isArray(payload.failures), "failures must be an array");
  return { valid: errors.length === 0, errors };
}

export function validateMergeBundleValidationManifest(payload) {
  const errors = [];
  pushError(errors, payload && typeof payload === "object", "payload must be an object");
  if (!payload || typeof payload !== "object") {
    return { valid: false, errors };
  }

  pushError(errors, isNonEmptyString(payload.generatedAtIso), "generatedAtIso must be non-empty string");
  pushError(errors, typeof payload.pass === "boolean", "pass must be boolean");
  pushError(errors, payload.files && typeof payload.files === "object", "files must be an object");
  if (payload.files && typeof payload.files === "object") {
    const keys = [
      "validationManifestPath",
      "bundleManifestPath",
      "releaseReadinessPath",
      "initialScopePath",
      "bundleArchivePath",
    ];
    for (const key of keys) {
      pushError(errors, isStringOrNull(payload.files[key]), `files.${key} must be string or null`);
    }
  }
  pushError(errors, payload.checks && typeof payload.checks === "object", "checks must be an object");
  if (payload.checks && typeof payload.checks === "object") {
    pushError(errors, Number.isFinite(payload.checks.buildExitCode), "checks.buildExitCode must be number");
    pushError(
      errors,
      typeof payload.checks.bundleManifestPresent === "boolean",
      "checks.bundleManifestPresent must be boolean",
    );
    pushError(
      errors,
      typeof payload.checks.bundleManifestPass === "boolean",
      "checks.bundleManifestPass must be boolean",
    );
    pushError(
      errors,
      Array.isArray(payload.checks.bundleFailures),
      "checks.bundleFailures must be an array",
    );
  }
  pushError(errors, Array.isArray(payload.failures), "failures must be an array");
  return { valid: errors.length === 0, errors };
}

export function validateHorizonCloseoutManifest(payload) {
  const errors = [];
  pushError(errors, payload && typeof payload === "object", "payload must be an object");
  if (!payload || typeof payload !== "object") {
    return { valid: false, errors };
  }

  pushError(errors, isNonEmptyString(payload.generatedAtIso), "generatedAtIso must be non-empty string");
  pushError(errors, typeof payload.pass === "boolean", "pass must be boolean");
  pushError(errors, payload.closeout && typeof payload.closeout === "object", "closeout must be an object");
  if (payload.closeout && typeof payload.closeout === "object") {
    pushError(
      errors,
      isStringOrNullOrUndefined(payload.closeout.horizon),
      "closeout.horizon must be string, null, or undefined",
    );
    pushError(
      errors,
      isStringOrNullOrUndefined(payload.closeout.nextHorizon),
      "closeout.nextHorizon must be string, null, or undefined",
    );
    pushError(
      errors,
      payload.closeout.canCloseHorizon === undefined
        || typeof payload.closeout.canCloseHorizon === "boolean",
      "closeout.canCloseHorizon must be boolean or undefined",
    );
    pushError(
      errors,
      payload.closeout.canStartNextHorizon === undefined
        || typeof payload.closeout.canStartNextHorizon === "boolean",
      "closeout.canStartNextHorizon must be boolean or undefined",
    );
  }

  pushError(
    errors,
    payload.files === undefined || (payload.files && typeof payload.files === "object"),
    "files must be an object or undefined",
  );
  if (payload.files && typeof payload.files === "object") {
    for (const key of ["evidenceDir", "horizonStatusFile", "outPath"]) {
      pushError(
        errors,
        isStringOrNullOrUndefined(payload.files[key]),
        `files.${key} must be string, null, or undefined`,
      );
    }
  }
  pushError(
    errors,
    payload.checks === undefined || (payload.checks && typeof payload.checks === "object"),
    "checks must be an object or undefined",
  );
  pushError(
    errors,
    payload.failures === undefined || Array.isArray(payload.failures),
    "failures must be an array or undefined",
  );
  return { valid: errors.length === 0, errors };
}

export function validateH2CloseoutRunManifest(payload) {
  const errors = [];
  pushError(errors, payload && typeof payload === "object", "payload must be an object");
  if (!payload || typeof payload !== "object") {
    return { valid: false, errors };
  }

  pushError(errors, isNonEmptyString(payload.generatedAtIso), "generatedAtIso must be non-empty string");
  pushError(errors, typeof payload.pass === "boolean", "pass must be boolean");
  pushError(
    errors,
    payload.files && typeof payload.files === "object",
    "files must be an object",
  );
  if (payload.files && typeof payload.files === "object") {
    for (const key of [
      "evidenceDir",
      "horizonStatusFile",
      "envFile",
      "outPath",
      "calibrationOut",
      "simulationOut",
      "closeoutOut",
      "closeoutFile",
    ]) {
      pushError(
        errors,
        isStringOrNullOrUndefined(payload.files[key]),
        `files.${key} must be string, null, or undefined`,
      );
    }
  }
  pushError(
    errors,
    payload.checks && typeof payload.checks === "object",
    "checks must be an object",
  );
  pushError(
    errors,
    payload.failures === undefined || Array.isArray(payload.failures),
    "failures must be an array or undefined",
  );
  return { valid: errors.length === 0, errors };
}

export function validateHorizonCloseoutRunManifest(payload) {
  const errors = [];
  pushError(errors, payload && typeof payload === "object", "payload must be an object");
  if (!payload || typeof payload !== "object") {
    return { valid: false, errors };
  }

  pushError(errors, isNonEmptyString(payload.generatedAtIso), "generatedAtIso must be non-empty string");
  pushError(errors, typeof payload.pass === "boolean", "pass must be boolean");
  pushError(
    errors,
    payload.horizon && typeof payload.horizon === "object",
    "horizon must be an object",
  );
  if (payload.horizon && typeof payload.horizon === "object") {
    pushError(
      errors,
      isStringOrNullOrUndefined(payload.horizon.source),
      "horizon.source must be string, null, or undefined",
    );
    pushError(
      errors,
      isStringOrNullOrUndefined(payload.horizon.next),
      "horizon.next must be string, null, or undefined",
    );
  }
  pushError(
    errors,
    payload.files && typeof payload.files === "object",
    "files must be an object",
  );
  if (payload.files && typeof payload.files === "object") {
    for (const key of [
      "evidenceDir",
      "horizonStatusFile",
      "envFile",
      "outPath",
      "calibrationOut",
      "simulationOut",
      "closeoutOut",
      "closeoutFile",
    ]) {
      pushError(
        errors,
        isStringOrNullOrUndefined(payload.files[key]),
        `files.${key} must be string, null, or undefined`,
      );
    }
  }
  pushError(
    errors,
    payload.checks && typeof payload.checks === "object",
    "checks must be an object",
  );
  pushError(
    errors,
    payload.failures === undefined || Array.isArray(payload.failures),
    "failures must be an array or undefined",
  );
  return { valid: errors.length === 0, errors };
}

export function validateHorizonPromotionManifest(payload) {
  const errors = [];
  pushError(errors, payload && typeof payload === "object", "payload must be an object");
  if (!payload || typeof payload !== "object") {
    return { valid: false, errors };
  }

  pushError(errors, isNonEmptyString(payload.generatedAtIso), "generatedAtIso must be non-empty string");
  pushError(errors, typeof payload.pass === "boolean", "pass must be boolean");
  pushError(
    errors,
    payload.horizon && typeof payload.horizon === "object",
    "horizon must be an object",
  );
  if (payload.horizon && typeof payload.horizon === "object") {
    pushError(
      errors,
      isStringOrNullOrUndefined(payload.horizon.source),
      "horizon.source must be string, null, or undefined",
    );
    pushError(
      errors,
      isStringOrNullOrUndefined(payload.horizon.next),
      "horizon.next must be string, null, or undefined",
    );
  }
  pushError(
    errors,
    payload.checks && typeof payload.checks === "object",
    "checks must be an object",
  );
  pushError(
    errors,
    payload.failures === undefined || Array.isArray(payload.failures),
    "failures must be an array or undefined",
  );
  return { valid: errors.length === 0, errors };
}

export function validateH2PromotionRunManifest(payload) {
  const errors = [];
  pushError(errors, payload && typeof payload === "object", "payload must be an object");
  if (!payload || typeof payload !== "object") {
    return { valid: false, errors };
  }

  pushError(errors, isNonEmptyString(payload.generatedAtIso), "generatedAtIso must be non-empty string");
  pushError(errors, typeof payload.pass === "boolean", "pass must be boolean");
  pushError(
    errors,
    payload.files && typeof payload.files === "object",
    "files must be an object",
  );
  pushError(
    errors,
    payload.checks && typeof payload.checks === "object",
    "checks must be an object",
  );
  pushError(
    errors,
    payload.failures === undefined || Array.isArray(payload.failures),
    "failures must be an array or undefined",
  );
  return { valid: errors.length === 0, errors };
}

export function validateHorizonPromotionRunManifest(payload) {
  const errors = [];
  pushError(errors, payload && typeof payload === "object", "payload must be an object");
  if (!payload || typeof payload !== "object") {
    return { valid: false, errors };
  }

  pushError(errors, isNonEmptyString(payload.generatedAtIso), "generatedAtIso must be non-empty string");
  pushError(errors, typeof payload.pass === "boolean", "pass must be boolean");
  pushError(
    errors,
    payload.horizon && typeof payload.horizon === "object",
    "horizon must be an object",
  );
  if (payload.horizon && typeof payload.horizon === "object") {
    pushError(
      errors,
      isStringOrNullOrUndefined(payload.horizon.source),
      "horizon.source must be string, null, or undefined",
    );
    pushError(
      errors,
      isStringOrNullOrUndefined(payload.horizon.next),
      "horizon.next must be string, null, or undefined",
    );
  }
  pushError(
    errors,
    payload.files && typeof payload.files === "object",
    "files must be an object",
  );
  pushError(
    errors,
    payload.checks && typeof payload.checks === "object",
    "checks must be an object",
  );
  pushError(
    errors,
    payload.failures === undefined || Array.isArray(payload.failures),
    "failures must be an array or undefined",
  );
  return { valid: errors.length === 0, errors };
}

export function validateStagePromotionReadinessManifest(payload) {
  const errors = [];
  pushError(errors, payload && typeof payload === "object", "payload must be an object");
  if (!payload || typeof payload !== "object") {
    return { valid: false, errors };
  }

  pushError(errors, isNonEmptyString(payload.generatedAtIso), "generatedAtIso must be non-empty string");
  pushError(errors, typeof payload.pass === "boolean", "pass must be boolean");
  pushError(errors, payload.stage && typeof payload.stage === "object", "stage must be an object");
  if (payload.stage && typeof payload.stage === "object") {
    pushError(
      errors,
      isStringOrNullOrUndefined(payload.stage.current),
      "stage.current must be string, null, or undefined",
    );
    pushError(
      errors,
      isStringOrNullOrUndefined(payload.stage.target),
      "stage.target must be string, null, or undefined",
    );
    pushError(
      errors,
      payload.stage.transitionAllowed === undefined
        || typeof payload.stage.transitionAllowed === "boolean",
      "stage.transitionAllowed must be boolean or undefined",
    );
  }
  pushError(errors, payload.checks && typeof payload.checks === "object", "checks must be an object");
  pushError(
    errors,
    payload.failures === undefined || Array.isArray(payload.failures),
    "failures must be an array or undefined",
  );
  return { valid: errors.length === 0, errors };
}

export function validateH2DrillSuiteManifest(payload) {
  const errors = [];
  pushError(errors, payload && typeof payload === "object", "payload must be an object");
  if (!payload || typeof payload !== "object") {
    return { valid: false, errors };
  }

  pushError(errors, isNonEmptyString(payload.generatedAtIso), "generatedAtIso must be non-empty string");
  pushError(errors, typeof payload.pass === "boolean", "pass must be boolean");
  pushError(errors, payload.checks && typeof payload.checks === "object", "checks must be an object");
  if (payload.checks && typeof payload.checks === "object") {
    const booleanOrNullKeys = [
      "canaryHoldPass",
      "majorityHoldPass",
      "rollbackSimulationTriggered",
      "rollbackSimulationPass",
    ];
    for (const key of booleanOrNullKeys) {
      pushError(
        errors,
        payload.checks[key] === null || typeof payload.checks[key] === "boolean",
        `checks.${key} must be boolean or null`,
      );
    }
    pushError(
      errors,
      payload.checks.rollbackPolicySourceConsistencySignalsReported === undefined
        || typeof payload.checks.rollbackPolicySourceConsistencySignalsReported === "boolean",
      "checks.rollbackPolicySourceConsistencySignalsReported must be boolean or undefined",
    );
    pushError(
      errors,
      payload.checks.rollbackPolicySourceConsistencySignalsPass === undefined
        || typeof payload.checks.rollbackPolicySourceConsistencySignalsPass === "boolean",
      "checks.rollbackPolicySourceConsistencySignalsPass must be boolean or undefined",
    );
  }
  pushError(
    errors,
    payload.failures === undefined || Array.isArray(payload.failures),
    "failures must be an array or undefined",
  );
  return { valid: errors.length === 0, errors };
}

export function validateSupervisedRollbackSimulationManifest(payload) {
  const errors = [];
  pushError(errors, payload && typeof payload === "object", "payload must be an object");
  if (!payload || typeof payload !== "object") {
    return { valid: false, errors };
  }

  pushError(errors, isNonEmptyString(payload.generatedAtIso), "generatedAtIso must be non-empty string");
  pushError(errors, typeof payload.pass === "boolean", "pass must be boolean");
  pushError(
    errors,
    isStringOrNullOrUndefined(payload.stage),
    "stage must be string, null, or undefined",
  );
  pushError(errors, payload.checks && typeof payload.checks === "object", "checks must be an object");
  pushError(
    errors,
    payload.failures === undefined || Array.isArray(payload.failures),
    "failures must be an array or undefined",
  );
  return { valid: errors.length === 0, errors };
}

export function validateRollbackThresholdCalibrationManifest(payload) {
  const errors = [];
  pushError(errors, payload && typeof payload === "object", "payload must be an object");
  if (!payload || typeof payload !== "object") {
    return { valid: false, errors };
  }

  pushError(errors, isNonEmptyString(payload.generatedAtIso), "generatedAtIso must be non-empty string");
  pushError(errors, typeof payload.pass === "boolean", "pass must be boolean");
  pushError(
    errors,
    isStringOrNullOrUndefined(payload.stage),
    "stage must be string, null, or undefined",
  );
  pushError(errors, Array.isArray(payload.samples), "samples must be an array");
  pushError(
    errors,
    payload.calibration && typeof payload.calibration === "object",
    "calibration must be an object",
  );
  pushError(
    errors,
    payload.failures === undefined || Array.isArray(payload.failures),
    "failures must be an array or undefined",
  );
  return { valid: errors.length === 0, errors };
}

export function validateStagePromotionExecutionManifest(payload) {
  const errors = [];
  pushError(errors, payload && typeof payload === "object", "payload must be an object");
  if (!payload || typeof payload !== "object") {
    return { valid: false, errors };
  }

  pushError(errors, isNonEmptyString(payload.generatedAtIso), "generatedAtIso must be non-empty string");
  pushError(errors, typeof payload.pass === "boolean", "pass must be boolean");
  pushError(errors, payload.stage && typeof payload.stage === "object", "stage must be an object");
  pushError(errors, payload.files && typeof payload.files === "object", "files must be an object");
  pushError(errors, payload.checks && typeof payload.checks === "object", "checks must be an object");
  pushError(
    errors,
    payload.failures === undefined || Array.isArray(payload.failures),
    "failures must be an array or undefined",
  );
  return { valid: errors.length === 0, errors };
}

export function validateAutoRollbackPolicyManifest(payload) {
  const errors = [];
  pushError(errors, payload && typeof payload === "object", "payload must be an object");
  if (!payload || typeof payload !== "object") {
    return { valid: false, errors };
  }

  pushError(errors, isNonEmptyString(payload.generatedAtIso), "generatedAtIso must be non-empty string");
  pushError(errors, typeof payload.pass === "boolean", "pass must be boolean");
  pushError(errors, payload.decision && typeof payload.decision === "object", "decision must be an object");
  if (payload.decision && typeof payload.decision === "object") {
    pushError(
      errors,
      payload.decision.action === "hold" || payload.decision.action === "rollback",
      "decision.action must be hold or rollback",
    );
  }
  pushError(
    errors,
    isStringOrNullOrUndefined(payload.stage),
    "stage must be string, null, or undefined",
  );
  pushError(errors, payload.checks && typeof payload.checks === "object", "checks must be an object");
  pushError(
    errors,
    payload.reasons === undefined || Array.isArray(payload.reasons),
    "reasons must be an array or undefined",
  );
  pushError(
    errors,
    payload.triggers === undefined || Array.isArray(payload.triggers),
    "triggers must be an array or undefined",
  );
  return { valid: errors.length === 0, errors };
}

export function validateStageDrillManifest(payload) {
  const errors = [];
  pushError(errors, payload && typeof payload === "object", "payload must be an object");
  if (!payload || typeof payload !== "object") {
    return { valid: false, errors };
  }

  pushError(errors, isNonEmptyString(payload.generatedAtIso), "generatedAtIso must be non-empty string");
  pushError(errors, typeof payload.pass === "boolean", "pass must be boolean");
  pushError(
    errors,
    isStringOrNullOrUndefined(payload.stage),
    "stage must be string, null, or undefined",
  );
  pushError(errors, payload.decision && typeof payload.decision === "object", "decision must be an object");
  if (payload.decision && typeof payload.decision === "object") {
    pushError(
      errors,
      payload.decision.action === "hold" || payload.decision.action === "rollback",
      "decision.action must be hold or rollback",
    );
  }
  pushError(errors, payload.checks && typeof payload.checks === "object", "checks must be an object");
  pushError(
    errors,
    payload.failures === undefined || Array.isArray(payload.failures),
    "failures must be an array or undefined",
  );
  return { valid: errors.length === 0, errors };
}


function isValidDispatchAuditTenantId(value) {
  if (value === null) {
    return true;
  }
  if (typeof value !== "string") {
    return false;
  }
  const t = value.trim();
  if (t.length === 0 || t.length > 128) {
    return false;
  }
  if (t.includes("/") || t.includes("\\")) {
    return false;
  }
  return true;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isLaneId(value) {
  return value === "eve" || value === "hermes";
}

function isFailureClass(value) {
  return (
    value === "none" ||
    value === "provider_limit" ||
    value === "cooldown" ||
    value === "dispatch_failure" ||
    value === "state_unavailable" ||
    value === "policy_failure"
  );
}

export function validateUnifiedDispatchAuditJsonlLine(record, lineIndex) {
  const prefix = `line ${String(lineIndex + 1)}`;
  const errors = [];
  pushError(errors, record && typeof record === "object", `${prefix}: must be a JSON object`);
  if (!record || typeof record !== "object") {
    return { valid: false, errors };
  }
  pushError(
    errors,
    record.auditSchemaVersion === 1 || record.auditSchemaVersion === 2,
    `${prefix}: auditSchemaVersion must be 1 or 2`,
  );
  const auditVer = record.auditSchemaVersion;
  if (record.tenantId !== undefined && record.tenantId !== null) {
    pushError(
      errors,
      isValidDispatchAuditTenantId(record.tenantId),
      `${prefix}: tenantId must be null or a non-empty tenant string (<=128 chars, no path separators)`,
    );
  }
  if (auditVer === 2) {
    pushError(
      errors,
      record.tenantId === null || typeof record.tenantId === "string",
      `${prefix}: tenantId must be present as null or string for auditSchemaVersion 2`,
    );
  }
  pushError(errors, isNonEmptyString(record.recordedAtIso), `${prefix}: recordedAtIso must be non-empty string`);
  pushError(errors, isNonEmptyString(record.traceId), `${prefix}: traceId must be non-empty string`);
  pushError(errors, isNonEmptyString(record.chatId), `${prefix}: chatId must be non-empty string`);
  pushError(errors, isNonEmptyString(record.messageId), `${prefix}: messageId must be non-empty string`);

  const routing = record.routing;
  pushError(errors, routing && typeof routing === "object", `${prefix}: routing must be an object`);
  if (routing && typeof routing === "object") {
    pushError(errors, isLaneId(routing.primaryLane), `${prefix}: routing.primaryLane must be eve or hermes`);
    pushError(
      errors,
      isLaneId(routing.fallbackLane) || routing.fallbackLane === "none",
      `${prefix}: routing.fallbackLane must be eve, hermes, or none`,
    );
    pushError(errors, isNonEmptyString(routing.reason), `${prefix}: routing.reason must be non-empty string`);
    pushError(
      errors,
      isNonEmptyString(routing.policyVersion),
      `${prefix}: routing.policyVersion must be non-empty string`,
    );
    pushError(errors, typeof routing.failClosed === "boolean", `${prefix}: routing.failClosed must be boolean`);
  }

  const primary = record.primaryState;
  pushError(errors, primary && typeof primary === "object", `${prefix}: primaryState must be an object`);
  if (primary && typeof primary === "object") {
    pushError(errors, primary.status === "pass" || primary.status === "failed", `${prefix}: primaryState.status invalid`);
    pushError(errors, isNonEmptyString(primary.reason), `${prefix}: primaryState.reason must be non-empty string`);
    pushError(errors, isNonEmptyString(primary.runtimeUsed), `${prefix}: primaryState.runtimeUsed must be string`);
    pushError(errors, isNonEmptyString(primary.runId), `${prefix}: primaryState.runId must be non-empty string`);
    pushError(errors, isFiniteNumber(primary.elapsedMs), `${prefix}: primaryState.elapsedMs must be finite number`);
    pushError(errors, isFailureClass(primary.failureClass), `${prefix}: primaryState.failureClass invalid`);
    pushError(errors, isLaneId(primary.sourceLane), `${prefix}: primaryState.sourceLane must be eve or hermes`);
    pushError(errors, isNonEmptyString(primary.sourceChatId), `${prefix}: primaryState.sourceChatId required`);
    pushError(errors, isNonEmptyString(primary.sourceMessageId), `${prefix}: primaryState.sourceMessageId required`);
    pushError(errors, isNonEmptyString(primary.traceId), `${prefix}: primaryState.traceId required`);
  }

  if (record.fallbackState !== undefined && record.fallbackState !== null) {
    const fb = record.fallbackState;
    pushError(errors, fb && typeof fb === "object", `${prefix}: fallbackState must be object or null`);
    if (fb && typeof fb === "object") {
      pushError(errors, fb.status === "pass" || fb.status === "failed", `${prefix}: fallbackState.status invalid`);
      pushError(errors, isNonEmptyString(fb.reason), `${prefix}: fallbackState.reason required`);
      pushError(errors, isNonEmptyString(fb.runtimeUsed), `${prefix}: fallbackState.runtimeUsed required`);
      pushError(errors, isNonEmptyString(fb.runId), `${prefix}: fallbackState.runId required`);
      pushError(errors, isFiniteNumber(fb.elapsedMs), `${prefix}: fallbackState.elapsedMs required`);
      pushError(errors, isFailureClass(fb.failureClass), `${prefix}: fallbackState.failureClass invalid`);
      pushError(errors, isLaneId(fb.sourceLane), `${prefix}: fallbackState.sourceLane invalid`);
      pushError(errors, isNonEmptyString(fb.sourceChatId), `${prefix}: fallbackState.sourceChatId required`);
      pushError(errors, isNonEmptyString(fb.sourceMessageId), `${prefix}: fallbackState.sourceMessageId required`);
      pushError(errors, isNonEmptyString(fb.traceId), `${prefix}: fallbackState.traceId required`);
    }
  }
  if (record.fallbackInfo !== undefined && record.fallbackInfo !== null) {
    const fi = record.fallbackInfo;
    pushError(errors, fi && typeof fi === "object", `${prefix}: fallbackInfo must be object`);
    if (fi && typeof fi === "object") {
      pushError(errors, typeof fi.attempted === "boolean", `${prefix}: fallbackInfo.attempted must be boolean`);
      pushError(errors, isNonEmptyString(fi.reason), `${prefix}: fallbackInfo.reason required`);
      pushError(errors, isLaneId(fi.fromLane), `${prefix}: fallbackInfo.fromLane invalid`);
      pushError(errors, isLaneId(fi.toLane), `${prefix}: fallbackInfo.toLane invalid`);
    }
  }
  if (record.capabilityDecision !== undefined && record.capabilityDecision !== null) {
    const cd = record.capabilityDecision;
    pushError(errors, cd && typeof cd === "object", `${prefix}: capabilityDecision must be object`);
    if (cd && typeof cd === "object") {
      pushError(errors, isNonEmptyString(cd.id), `${prefix}: capabilityDecision.id required`);
      pushError(errors, isLaneId(cd.lane), `${prefix}: capabilityDecision.lane invalid`);
      pushError(errors, isNonEmptyString(cd.routeReason), `${prefix}: capabilityDecision.routeReason required`);
    }
  }
  if (record.capabilityExecution !== undefined && record.capabilityExecution !== null) {
    const ce = record.capabilityExecution;
    pushError(errors, ce && typeof ce === "object", `${prefix}: capabilityExecution must be object`);
    if (ce && typeof ce === "object") {
      pushError(errors, ce.status === "pass" || ce.status === "failed", `${prefix}: capabilityExecution.status invalid`);
      pushError(errors, typeof ce.consumed === "boolean", `${prefix}: capabilityExecution.consumed must be boolean`);
      pushError(errors, isNonEmptyString(ce.reason), `${prefix}: capabilityExecution.reason required`);
      pushError(errors, isNonEmptyString(ce.outputText), `${prefix}: capabilityExecution.outputText required`);
      pushError(errors, isFailureClass(ce.failureClass), `${prefix}: capabilityExecution.failureClass invalid`);
      pushError(errors, isNonEmptyString(ce.runId), `${prefix}: capabilityExecution.runId required`);
      pushError(errors, isFiniteNumber(ce.elapsedMs), `${prefix}: capabilityExecution.elapsedMs must be finite`);
      const cap = ce.capability;
      pushError(errors, cap && typeof cap === "object", `${prefix}: capabilityExecution.capability must be object`);
      if (cap && typeof cap === "object") {
        pushError(errors, isNonEmptyString(cap.id), `${prefix}: capabilityExecution.capability.id required`);
        pushError(errors, isLaneId(cap.lane), `${prefix}: capabilityExecution.capability.lane invalid`);
        pushError(errors, isNonEmptyString(cap.routeReason), `${prefix}: capabilityExecution.capability.routeReason required`);
      }
    }
  }

  const response = record.response;
  pushError(errors, response && typeof response === "object", `${prefix}: response must be an object`);
  if (response && typeof response === "object") {
    pushError(errors, typeof response.consumed === "boolean", `${prefix}: response.consumed must be boolean`);
    pushError(errors, typeof response.responseText === "string", `${prefix}: response.responseText must be string`);
    pushError(errors, isFailureClass(response.failureClass), `${prefix}: response.failureClass invalid`);
    pushError(errors, isLaneId(response.laneUsed), `${prefix}: response.laneUsed invalid`);
    pushError(errors, isNonEmptyString(response.traceId), `${prefix}: response.traceId required`);
  }

  return { valid: errors.length === 0, errors };
}

export function validateUnifiedDispatchAuditJsonlText(raw) {
  const errors = [];
  const lines = String(raw ?? "").split(/\r?\n/);
  const nonEmpty = lines.map((l) => l.trim()).filter((l) => l.length > 0);
  pushError(errors, nonEmpty.length > 0, "file must contain at least one non-empty JSON line");
  if (nonEmpty.length === 0) {
    return { valid: false, errors };
  }
  for (let i = 0; i < nonEmpty.length; i += 1) {
    let parsed;
    try {
      parsed = JSON.parse(nonEmpty[i]);
    } catch {
      errors.push(`line ${String(i + 1)}: invalid JSON`);
      continue;
    }
    const lineResult = validateUnifiedDispatchAuditJsonlLine(parsed, i);
    errors.push(...lineResult.errors);
  }
  return { valid: errors.length === 0, errors };
}

export function validateManifestSchema(type, payload) {
  if (type === "release-readiness") {
    return validateReleaseReadinessManifest(payload);
  }
  if (type === "merge-bundle") {
    return validateMergeBundleManifest(payload);
  }
  if (type === "merge-bundle-validation") {
    return validateMergeBundleValidationManifest(payload);
  }
  if (type === "horizon-closeout") {
    return validateHorizonCloseoutManifest(payload);
  }
  if (type === "h2-closeout-run") {
    return validateH2CloseoutRunManifest(payload);
  }
  if (type === "horizon-closeout-run") {
    return validateHorizonCloseoutRunManifest(payload);
  }
  if (type === "horizon-promotion") {
    return validateHorizonPromotionManifest(payload);
  }
  if (type === "h2-promotion-run") {
    return validateH2PromotionRunManifest(payload);
  }
  if (type === "horizon-promotion-run") {
    return validateHorizonPromotionRunManifest(payload);
  }
  if (type === "stage-promotion-readiness") {
    return validateStagePromotionReadinessManifest(payload);
  }
  if (type === "h2-drill-suite") {
    return validateH2DrillSuiteManifest(payload);
  }
  if (type === "supervised-rollback-simulation") {
    return validateSupervisedRollbackSimulationManifest(payload);
  }
  if (type === "rollback-threshold-calibration") {
    return validateRollbackThresholdCalibrationManifest(payload);
  }
  if (type === "stage-promotion-execution") {
    return validateStagePromotionExecutionManifest(payload);
  }
  if (type === "auto-rollback-policy") {
    return validateAutoRollbackPolicyManifest(payload);
  }
  if (type === "stage-drill") {
    return validateStageDrillManifest(payload);
  }
  return { valid: false, errors: [`Unsupported manifest type: ${type}`] };
}

async function validateTypedArtifact(type, filePath) {
  const resolved = path.resolve(filePath);
  if (type === "unified-dispatch-audit-jsonl") {
    const raw = await readFile(resolved, "utf8");
    const validation = validateUnifiedDispatchAuditJsonlText(raw);
    return {
      type,
      file: resolved,
      valid: validation.valid,
      errors: validation.errors,
    };
  }
  const payload = JSON.parse(await readFile(resolved, "utf8"));
  const validation = validateManifestSchema(type, payload);
  return {
    type,
    file: resolved,
    valid: validation.valid,
    errors: validation.errors,
  };
}

async function validateSingleFile(type, filePath) {
  return validateTypedArtifact(type, filePath);
}

function parseArgs(argv) {
  const options = {
    type: "",
    file: "",
    evidenceDir: "",
    latestOnly: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === "--type") {
      options.type = value ?? "";
      i += 1;
    } else if (arg === "--file") {
      options.file = value ?? "";
      i += 1;
    } else if (arg === "--evidence-dir") {
      options.evidenceDir = value ?? "";
      i += 1;
    } else if (arg === "--latest-only") {
      options.latestOnly = true;
    }
  }
  return options;
}

async function listAllManifestTargets(evidenceDir) {
  const entries = await readdir(evidenceDir, { withFileTypes: true });
  const releaseTargets = [];
  const mergeBundleValidationTargets = [];
  const horizonCloseoutTargets = [];
  const h2CloseoutRunTargets = [];
  const horizonCloseoutRunTargets = [];
  const horizonPromotionTargets = [];
  const h2PromotionRunTargets = [];
  const horizonPromotionRunTargets = [];
  const stagePromotionReadinessTargets = [];
  const h2DrillSuiteTargets = [];
  const supervisedRollbackSimulationTargets = [];
  const rollbackThresholdCalibrationTargets = [];
  const stagePromotionExecutionTargets = [];
  const autoRollbackPolicyTargets = [];
  const stageDrillTargets = [];
  const dispatchAuditJsonlTargets = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    if (entry.name.startsWith("release-readiness-") && entry.name.endsWith(".json")) {
      releaseTargets.push({
        type: "release-readiness",
        file: path.join(evidenceDir, entry.name),
      });
    } else if (entry.name.startsWith("merge-bundle-validation-") && entry.name.endsWith(".json")) {
      mergeBundleValidationTargets.push({
        type: "merge-bundle-validation",
        file: path.join(evidenceDir, entry.name),
      });
    } else if (entry.name.startsWith("horizon-closeout-") && entry.name.endsWith(".json")) {
      horizonCloseoutTargets.push({
        type: "horizon-closeout",
        file: path.join(evidenceDir, entry.name),
      });
    } else if (entry.name.startsWith("h2-closeout-run-") && entry.name.endsWith(".json")) {
      h2CloseoutRunTargets.push({
        type: "h2-closeout-run",
        file: path.join(evidenceDir, entry.name),
      });
    } else if (
      entry.name.startsWith("horizon-closeout-run-") &&
      entry.name.endsWith(".json")
    ) {
      horizonCloseoutRunTargets.push({
        type: "horizon-closeout-run",
        file: path.join(evidenceDir, entry.name),
      });
    } else if (entry.name.startsWith("horizon-promotion-") && entry.name.endsWith(".json")) {
      horizonPromotionTargets.push({
        type: "horizon-promotion",
        file: path.join(evidenceDir, entry.name),
      });
    } else if (entry.name.startsWith("h2-promotion-run-") && entry.name.endsWith(".json")) {
      h2PromotionRunTargets.push({
        type: "h2-promotion-run",
        file: path.join(evidenceDir, entry.name),
      });
    } else if (
      entry.name.startsWith("horizon-promotion-run-") &&
      entry.name.endsWith(".json")
    ) {
      horizonPromotionRunTargets.push({
        type: "horizon-promotion-run",
        file: path.join(evidenceDir, entry.name),
      });
    } else if (entry.name.startsWith("stage-promotion-readiness-") && entry.name.endsWith(".json")) {
      stagePromotionReadinessTargets.push({
        type: "stage-promotion-readiness",
        file: path.join(evidenceDir, entry.name),
      });
    } else if (entry.name.startsWith("h2-drill-suite-") && entry.name.endsWith(".json")) {
      h2DrillSuiteTargets.push({
        type: "h2-drill-suite",
        file: path.join(evidenceDir, entry.name),
      });
    } else if (entry.name.startsWith("supervised-rollback-simulation-") && entry.name.endsWith(".json")) {
      supervisedRollbackSimulationTargets.push({
        type: "supervised-rollback-simulation",
        file: path.join(evidenceDir, entry.name),
      });
    } else if (entry.name.startsWith("rollback-threshold-calibration-") && entry.name.endsWith(".json")) {
      rollbackThresholdCalibrationTargets.push({
        type: "rollback-threshold-calibration",
        file: path.join(evidenceDir, entry.name),
      });
    } else if (entry.name.startsWith("stage-promotion-execution-") && entry.name.endsWith(".json")) {
      stagePromotionExecutionTargets.push({
        type: "stage-promotion-execution",
        file: path.join(evidenceDir, entry.name),
      });
    } else if (entry.name.startsWith("auto-rollback-policy-") && entry.name.endsWith(".json")) {
      autoRollbackPolicyTargets.push({
        type: "auto-rollback-policy",
        file: path.join(evidenceDir, entry.name),
      });
    } else if (entry.name.startsWith("stage-drill-") && entry.name.endsWith(".json")) {
      stageDrillTargets.push({
        type: "stage-drill",
        file: path.join(evidenceDir, entry.name),
      });
    } else if (entry.name.startsWith("unified-dispatch-audit-") && entry.name.endsWith(".jsonl")) {
      dispatchAuditJsonlTargets.push({
        type: "unified-dispatch-audit-jsonl",
        file: path.join(evidenceDir, entry.name),
      });
    }
  }
  releaseTargets.sort((a, b) => a.file.localeCompare(b.file));
  mergeBundleValidationTargets.sort((a, b) => a.file.localeCompare(b.file));
  horizonCloseoutTargets.sort((a, b) => a.file.localeCompare(b.file));
  h2CloseoutRunTargets.sort((a, b) => a.file.localeCompare(b.file));
  horizonCloseoutRunTargets.sort((a, b) => a.file.localeCompare(b.file));
  horizonPromotionTargets.sort((a, b) => a.file.localeCompare(b.file));
  h2PromotionRunTargets.sort((a, b) => a.file.localeCompare(b.file));
  horizonPromotionRunTargets.sort((a, b) => a.file.localeCompare(b.file));
  stagePromotionReadinessTargets.sort((a, b) => a.file.localeCompare(b.file));
  h2DrillSuiteTargets.sort((a, b) => a.file.localeCompare(b.file));
  supervisedRollbackSimulationTargets.sort((a, b) => a.file.localeCompare(b.file));
  rollbackThresholdCalibrationTargets.sort((a, b) => a.file.localeCompare(b.file));
  stagePromotionExecutionTargets.sort((a, b) => a.file.localeCompare(b.file));
  autoRollbackPolicyTargets.sort((a, b) => a.file.localeCompare(b.file));
  stageDrillTargets.sort((a, b) => a.file.localeCompare(b.file));
  dispatchAuditJsonlTargets.sort((a, b) => a.file.localeCompare(b.file));
  return {
    releaseTargets,
    mergeBundleValidationTargets,
    horizonCloseoutTargets,
    h2CloseoutRunTargets,
    horizonCloseoutRunTargets,
    horizonPromotionTargets,
    h2PromotionRunTargets,
    horizonPromotionRunTargets,
    stagePromotionReadinessTargets,
    h2DrillSuiteTargets,
    supervisedRollbackSimulationTargets,
    rollbackThresholdCalibrationTargets,
    stagePromotionExecutionTargets,
    autoRollbackPolicyTargets,
    stageDrillTargets,
    dispatchAuditJsonlTargets,
  };
}

function formatFailureMessage(results) {
  const details = [];
  for (const result of results) {
    for (const issue of result.errors) {
      details.push(`${result.type}:${result.file}:${issue}`);
    }
  }
  return `Manifest schema validation failed:\n- ${details.join("\n- ")}`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!isNonEmptyString(options.type)) {
    throw new Error(
      "Missing --type (release-readiness|merge-bundle|merge-bundle-validation|horizon-closeout|h2-closeout-run|horizon-closeout-run|horizon-promotion|h2-promotion-run|horizon-promotion-run|stage-promotion-readiness|h2-drill-suite|supervised-rollback-simulation|rollback-threshold-calibration|stage-promotion-execution|auto-rollback-policy|stage-drill|unified-dispatch-audit-jsonl|all)",
    );
  }

  if (options.type === "all") {
    if (!isNonEmptyString(options.evidenceDir)) {
      throw new Error("Missing --evidence-dir for --type all");
    }
    const evidenceDir = path.resolve(options.evidenceDir);
    const targetGroups = await listAllManifestTargets(evidenceDir);
    const targets = options.latestOnly
      ? [
          ...(targetGroups.releaseTargets.length > 0
            ? [targetGroups.releaseTargets[targetGroups.releaseTargets.length - 1]]
            : []),
          ...(targetGroups.mergeBundleValidationTargets.length > 0
            ? [
                targetGroups.mergeBundleValidationTargets[
                  targetGroups.mergeBundleValidationTargets.length - 1
                ],
              ]
            : []),
          ...(targetGroups.horizonCloseoutTargets.length > 0
            ? [targetGroups.horizonCloseoutTargets[targetGroups.horizonCloseoutTargets.length - 1]]
            : []),
          ...(targetGroups.h2CloseoutRunTargets.length > 0
            ? [targetGroups.h2CloseoutRunTargets[targetGroups.h2CloseoutRunTargets.length - 1]]
            : []),
          ...(targetGroups.horizonCloseoutRunTargets.length > 0
            ? [
                targetGroups.horizonCloseoutRunTargets[
                  targetGroups.horizonCloseoutRunTargets.length - 1
                ],
              ]
            : []),
          ...(targetGroups.horizonPromotionTargets.length > 0
            ? [targetGroups.horizonPromotionTargets[targetGroups.horizonPromotionTargets.length - 1]]
            : []),
          ...(targetGroups.h2PromotionRunTargets.length > 0
            ? [targetGroups.h2PromotionRunTargets[targetGroups.h2PromotionRunTargets.length - 1]]
            : []),
          ...(targetGroups.horizonPromotionRunTargets.length > 0
            ? [
                targetGroups.horizonPromotionRunTargets[
                  targetGroups.horizonPromotionRunTargets.length - 1
                ],
              ]
            : []),
          ...(targetGroups.stagePromotionReadinessTargets.length > 0
            ? [
                targetGroups.stagePromotionReadinessTargets[
                  targetGroups.stagePromotionReadinessTargets.length - 1
                ],
              ]
            : []),
          ...(targetGroups.h2DrillSuiteTargets.length > 0
            ? [targetGroups.h2DrillSuiteTargets[targetGroups.h2DrillSuiteTargets.length - 1]]
            : []),
          ...(targetGroups.supervisedRollbackSimulationTargets.length > 0
            ? [
                targetGroups.supervisedRollbackSimulationTargets[
                  targetGroups.supervisedRollbackSimulationTargets.length - 1
                ],
              ]
            : []),
          ...(targetGroups.rollbackThresholdCalibrationTargets.length > 0
            ? [
                targetGroups.rollbackThresholdCalibrationTargets[
                  targetGroups.rollbackThresholdCalibrationTargets.length - 1
                ],
              ]
            : []),
          ...(targetGroups.stagePromotionExecutionTargets.length > 0
            ? [
                targetGroups.stagePromotionExecutionTargets[
                  targetGroups.stagePromotionExecutionTargets.length - 1
                ],
              ]
            : []),
          ...(targetGroups.autoRollbackPolicyTargets.length > 0
            ? [targetGroups.autoRollbackPolicyTargets[targetGroups.autoRollbackPolicyTargets.length - 1]]
            : []),
          ...(targetGroups.stageDrillTargets.length > 0
            ? [targetGroups.stageDrillTargets[targetGroups.stageDrillTargets.length - 1]]
            : []),
          ...(targetGroups.dispatchAuditJsonlTargets.length > 0
            ? [
                targetGroups.dispatchAuditJsonlTargets[
                  targetGroups.dispatchAuditJsonlTargets.length - 1
                ],
              ]
            : []),
        ]
      : [
          ...targetGroups.releaseTargets,
          ...targetGroups.mergeBundleValidationTargets,
          ...targetGroups.horizonCloseoutTargets,
          ...targetGroups.h2CloseoutRunTargets,
          ...targetGroups.horizonCloseoutRunTargets,
          ...targetGroups.horizonPromotionTargets,
          ...targetGroups.h2PromotionRunTargets,
          ...targetGroups.horizonPromotionRunTargets,
          ...targetGroups.stagePromotionReadinessTargets,
          ...targetGroups.h2DrillSuiteTargets,
          ...targetGroups.supervisedRollbackSimulationTargets,
          ...targetGroups.rollbackThresholdCalibrationTargets,
          ...targetGroups.stagePromotionExecutionTargets,
          ...targetGroups.autoRollbackPolicyTargets,
          ...targetGroups.stageDrillTargets,
          ...targetGroups.dispatchAuditJsonlTargets,
        ];
    const results = [];
    for (const target of targets) {
      results.push(await validateSingleFile(target.type, target.file));
    }
    const failures = results.filter((result) => !result.valid);
    const payload = {
      pass: failures.length === 0,
      evidenceDir,
      validatedCount: results.length,
      results,
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    if (failures.length > 0) {
      process.stderr.write(`${formatFailureMessage(failures)}\n`);
      process.exitCode = 2;
    }
    return;
  }

  if (!isNonEmptyString(options.file)) {
    throw new Error("Missing --file");
  }
  const result = await validateSingleFile(options.type, options.file);
  if (!result.valid) {
    throw new Error(formatFailureMessage([result]));
  }
  process.stdout.write(
    `${JSON.stringify({ file: result.file, type: result.type, valid: true }, null, 2)}\n`,
  );
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main().catch((error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 2;
  });
}
