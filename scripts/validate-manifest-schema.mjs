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
  return { valid: false, errors: [`Unsupported manifest type: ${type}`] };
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

async function validateSingleFile(type, filePath) {
  const resolved = path.resolve(filePath);
  const payload = JSON.parse(await readFile(resolved, "utf8"));
  const validation = validateManifestSchema(type, payload);
  return {
    type,
    file: resolved,
    valid: validation.valid,
    errors: validation.errors,
  };
}

async function listAllManifestTargets(evidenceDir) {
  const entries = await readdir(evidenceDir, { withFileTypes: true });
  const releaseTargets = [];
  const mergeBundleValidationTargets = [];
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
    }
  }
  releaseTargets.sort((a, b) => a.file.localeCompare(b.file));
  mergeBundleValidationTargets.sort((a, b) => a.file.localeCompare(b.file));
  return {
    releaseTargets,
    mergeBundleValidationTargets,
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
    throw new Error("Missing --type (release-readiness|merge-bundle|merge-bundle-validation|all)");
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
        ]
      : [...targetGroups.releaseTargets, ...targetGroups.mergeBundleValidationTargets];
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
