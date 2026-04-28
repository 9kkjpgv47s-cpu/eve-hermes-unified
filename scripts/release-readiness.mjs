#!/usr/bin/env node
import { readdir, readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { validateManifestSchema } from "./validate-manifest-schema.mjs";

function parseArgs(argv) {
  const options = {
    evidenceDir: "",
    out: "",
    commandLogDir: "",
    commandsFile: "",
    requiredCommandNames: "",
    goalPolicyFileValidationReport: "",
    requireGoalPolicyFileValidationReport: true,
    requireGoalPolicySourceConsistencyReport: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === "--evidence-dir") {
      options.evidenceDir = value ?? "";
      i += 1;
    } else if (arg === "--out") {
      options.out = value ?? "";
      i += 1;
    } else if (arg === "--command-log-dir") {
      options.commandLogDir = value ?? "";
      i += 1;
    } else if (arg === "--commands-file") {
      options.commandsFile = value ?? "";
      i += 1;
    } else if (arg === "--required-command-names") {
      options.requiredCommandNames = value ?? "";
      i += 1;
    } else if (
      arg === "--goal-policy-file-validation-report" ||
      arg === "--goal-policy-validation-report"
    ) {
      options.goalPolicyFileValidationReport = value ?? "";
      i += 1;
    } else if (
      arg === "--require-goal-policy-file-validation-report" ||
      arg === "--require-goal-policy-validation-report"
    ) {
      options.requireGoalPolicyFileValidationReport = true;
    } else if (
      arg === "--allow-missing-goal-policy-file-validation-report" ||
      arg === "--allow-missing-goal-policy-validation-report"
    ) {
      options.requireGoalPolicyFileValidationReport = false;
    } else if (
      arg === "--require-goal-policy-source-consistency-report" ||
      arg === "--require-goal-policy-source-consistency"
    ) {
      options.requireGoalPolicySourceConsistencyReport = true;
    } else if (
      arg === "--allow-missing-goal-policy-source-consistency-report" ||
      arg === "--allow-missing-goal-policy-source-consistency"
    ) {
      options.requireGoalPolicySourceConsistencyReport = false;
    }
  }
  if (!options.evidenceDir) {
    throw new Error("Missing --evidence-dir");
  }
  return options;
}

async function newestFileInDir(dir, prefix) {
  const entries = await readdir(dir, { withFileTypes: true });
  const matches = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix))
    .map((entry) => path.join(dir, entry.name));
  if (matches.length === 0) {
    return null;
  }
  matches.sort();
  return matches[matches.length - 1];
}

async function newestFileWithPrefixes(dir, prefixes) {
  const entries = await readdir(dir, { withFileTypes: true });
  const matches = entries
    .filter((entry) => entry.isFile() && prefixes.some((prefix) => entry.name.startsWith(prefix)))
    .map((entry) => path.join(dir, entry.name));
  if (matches.length === 0) {
    return null;
  }
  matches.sort();
  return matches[matches.length - 1];
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function evaluateCommandLogs(commandLogDir) {
  if (!commandLogDir) {
    return { required: [], missing: [], discovered: [] };
  }
  const entries = await readdir(commandLogDir, { withFileTypes: true });
  const discovered = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".log"))
    .map((entry) => entry.name)
    .sort();
  return {
    required: discovered.length > 0 ? discovered : ["<at-least-one-log>"],
    missing: discovered.length > 0 ? [] : ["<at-least-one-log>"],
    discovered,
  };
}

function commandKey(command) {
  return command.trim().toLowerCase();
}

function normalizeReleaseCommands(raw) {
  if (!raw || raw.trim().length === 0) {
    return [];
  }
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => commandKey(item));
}

async function readCommandsFile(commandsFile) {
  if (!commandsFile || !(await exists(commandsFile))) {
    return [];
  }
  const payload = await readJson(commandsFile);
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      name: String(item.name ?? ""),
      command: String(item.command ?? ""),
      logFile: String(item.logFile ?? ""),
      exitCode: Number(item.exitCode),
      status: item.status === "passed" || item.status === "failed" ? item.status : "failed",
    }));
}

function commandId(entry) {
  const name = typeof entry?.name === "string" ? entry.name.trim() : "";
  const command = typeof entry?.command === "string" ? entry.command.trim() : "";
  return commandKey(name || command);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const requireGoalPolicyFileValidationReportFromEnv =
    process.env.UNIFIED_RELEASE_READINESS_REQUIRE_GOAL_POLICY_FILE_VALIDATION_REPORT;
  if (
    typeof requireGoalPolicyFileValidationReportFromEnv === "string" &&
    requireGoalPolicyFileValidationReportFromEnv.trim().length > 0
  ) {
    options.requireGoalPolicyFileValidationReport =
      requireGoalPolicyFileValidationReportFromEnv.trim() !== "0";
  }
  const requireGoalPolicySourceConsistencyReportFromEnv =
    process.env.UNIFIED_RELEASE_READINESS_REQUIRE_GOAL_POLICY_SOURCE_CONSISTENCY_REPORT;
  if (
    typeof requireGoalPolicySourceConsistencyReportFromEnv === "string" &&
    requireGoalPolicySourceConsistencyReportFromEnv.trim().length > 0
  ) {
    options.requireGoalPolicySourceConsistencyReport =
      requireGoalPolicySourceConsistencyReportFromEnv.trim() !== "0";
  }
  const evidenceDir = path.resolve(options.evidenceDir);
  const validationSummaryPath = await newestFileInDir(evidenceDir, "validation-summary-");
  const regressionPath = await newestFileInDir(evidenceDir, "regression-eve-primary-");
  const cutoverPath = await newestFileInDir(evidenceDir, "cutover-readiness-");
  const failureInjectionPath = await newestFileInDir(evidenceDir, "failure-injection-");
  const soakPath = await newestFileInDir(evidenceDir, "soak-");
  const explicitGoalPolicyValidationPath = options.goalPolicyFileValidationReport
    ? path.resolve(options.goalPolicyFileValidationReport)
    : "";
  const discoveredGoalPolicyValidationPath = explicitGoalPolicyValidationPath
    || (await newestFileWithPrefixes(evidenceDir, [
      "goal-policy-file-validation-",
      "goal-policy-validation-",
    ]))
    || ((await exists(path.join(evidenceDir, "goal-policy-file-validation.json")))
      ? path.join(evidenceDir, "goal-policy-file-validation.json")
      : null);
  const goalPolicyValidationPath = discoveredGoalPolicyValidationPath || null;

  const failures = [];
  if (!validationSummaryPath) {
    failures.push("missing_validation_summary");
  }
  if (!regressionPath) {
    failures.push("missing_regression_report");
  }
  if (!cutoverPath) {
    failures.push("missing_cutover_readiness_report");
  }
  if (!failureInjectionPath) {
    failures.push("missing_failure_injection_report");
  }
  if (!soakPath) {
    failures.push("missing_soak_report");
  }
  if (options.requireGoalPolicyFileValidationReport && !goalPolicyValidationPath) {
    failures.push("missing_goal_policy_file_validation_report");
  }
  const requiredArtifacts = [
    { name: "validation-summary", path: validationSummaryPath, present: Boolean(validationSummaryPath) },
    { name: "regression-eve-primary", path: regressionPath, present: Boolean(regressionPath) },
    { name: "cutover-readiness", path: cutoverPath, present: Boolean(cutoverPath) },
    { name: "failure-injection", path: failureInjectionPath, present: Boolean(failureInjectionPath) },
    { name: "soak", path: soakPath, present: Boolean(soakPath) },
    {
      name: "goal-policy-file-validation",
      path: goalPolicyValidationPath,
      present: Boolean(goalPolicyValidationPath),
    },
  ];

  let validationSummary = null;
  let regressionSummary = null;
  let cutoverSummary = null;
  let goalPolicyValidationSummary = null;
  let goalPolicySourceConsistencyReported = false;
  let goalPolicySourceConsistencyPassed = false;
  let goalPolicySourceConsistencyOverlapTransitions = [];
  let goalPolicySourceConsistencyConflictTransitions = [];
  let soakSloSummary = null;
  let soakSloPath = null;
  if (validationSummaryPath) {
    validationSummary = await readJson(validationSummaryPath);
    if (!validationSummary?.gates?.passed) {
      failures.push("validation_summary_failed");
    }
  }
  if (regressionPath) {
    regressionSummary = await readJson(regressionPath);
    const regressionPass = Boolean(
      regressionSummary?.pass === true || regressionSummary?.passed === true,
    );
    if (!regressionPass) {
      failures.push("regression_gate_failed");
    }
  }
  if (cutoverPath) {
    cutoverSummary = await readJson(cutoverPath);
    if (!cutoverSummary?.pass) {
      failures.push("cutover_readiness_failed");
    }
  }
  const requireSoakSloFromEnv = process.env.UNIFIED_RELEASE_READINESS_REQUIRE_SOAK_SLO;
  const requireSoakSlo =
    typeof requireSoakSloFromEnv === "string" && requireSoakSloFromEnv.trim() !== "0";
  if (requireSoakSlo) {
    soakSloPath = await newestFileWithPrefixes(evidenceDir, ["soak-slo-"]);
    if (!soakSloPath) {
      failures.push("missing_soak_slo_report");
    } else {
      soakSloSummary = await readJson(soakSloPath);
      if (soakSloSummary?.pass !== true) {
        failures.push("soak_slo_gate_failed");
      }
    }
  }
  if (goalPolicyValidationPath) {
    goalPolicyValidationSummary = await readJson(goalPolicyValidationPath);
    if (goalPolicyValidationSummary?.pass !== true) {
      failures.push("goal_policy_file_validation_failed");
    }
    const crossSourceConsistencyChecked =
      goalPolicyValidationSummary?.checks?.crossSourceConsistencyChecked;
    const crossSourceConsistencyPass =
      goalPolicyValidationSummary?.checks?.crossSourceConsistencyPass;
    goalPolicySourceConsistencyReported =
      typeof crossSourceConsistencyChecked === "boolean" &&
      typeof crossSourceConsistencyPass === "boolean";
    goalPolicySourceConsistencyPassed =
      crossSourceConsistencyChecked === true && crossSourceConsistencyPass === true;
    goalPolicySourceConsistencyOverlapTransitions = Array.isArray(
      goalPolicyValidationSummary?.checks?.crossSourceOverlapTransitionKeys,
    )
      ? goalPolicyValidationSummary.checks.crossSourceOverlapTransitionKeys
      : [];
    goalPolicySourceConsistencyConflictTransitions = Array.isArray(
      goalPolicyValidationSummary?.checks?.crossSourceConflictTransitionKeys,
    )
      ? goalPolicyValidationSummary.checks.crossSourceConflictTransitionKeys
      : [];
    if (options.requireGoalPolicySourceConsistencyReport) {
      if (!goalPolicySourceConsistencyReported) {
        failures.push("goal_policy_source_consistency_not_reported");
      } else if (!goalPolicySourceConsistencyPassed) {
        failures.push("goal_policy_source_consistency_not_passed");
      }
    }
  } else if (
    options.requireGoalPolicySourceConsistencyReport &&
    options.requireGoalPolicyFileValidationReport
  ) {
    failures.push("missing_goal_policy_source_consistency_report");
  }

  const commandLogs = await evaluateCommandLogs(options.commandLogDir);
  if (commandLogs.missing.length > 0) {
    failures.push(`missing_command_logs:${commandLogs.missing.join(",")}`);
  }
  const releaseCommandLogs = await readCommandsFile(options.commandsFile);
  const requiredReleaseCommandSource =
    options.requiredCommandNames ||
    process.env.UNIFIED_RELEASE_READINESS_REQUIRED_COMMANDS ||
    "check,test,build,validate:failure-injection,validate:soak,validate:evidence-summary,validate:regression-eve,validate:cutover-readiness";
  const requiredReleaseCommands = normalizeReleaseCommands(requiredReleaseCommandSource);
  const executedReleaseCommands = new Set(releaseCommandLogs.map((entry) => commandId(entry)));
  const missingRequiredCommands = requiredReleaseCommands.filter(
    (command) => !executedReleaseCommands.has(command),
  );
  if (missingRequiredCommands.length > 0) {
    failures.push(`missing_required_commands:${missingRequiredCommands.join(",")}`);
  }
  const missingCommandLogFiles = [];
  if (options.commandLogDir && releaseCommandLogs.length > 0) {
    for (const entry of releaseCommandLogs) {
      const rawLogFile = (entry.logFile || "").trim();
      if (!rawLogFile) {
        missingCommandLogFiles.push("<missing-log-file-path>");
        continue;
      }
      const resolvedLogFile = path.isAbsolute(rawLogFile)
        ? rawLogFile
        : path.join(options.commandLogDir, rawLogFile);
      if (!(await exists(resolvedLogFile))) {
        missingCommandLogFiles.push(rawLogFile);
      }
    }
  }
  for (const missingLogFile of missingCommandLogFiles) {
    failures.push(`missing_command_log_file:${missingLogFile}`);
  }

  const commandFailures = releaseCommandLogs.filter(
    (entry) => entry.status !== "passed" || entry.exitCode !== 0,
  );
  if (releaseCommandLogs.length > 0) {
    for (const entry of releaseCommandLogs) {
      if (entry.status !== "passed" || entry.exitCode !== 0) {
        failures.push(`validation_command_failed:${entry.command || "<unknown>"}`);
      }
    }
  }

  const outPath =
    options.out && options.out.trim().length > 0
      ? path.resolve(options.out)
      : path.join(evidenceDir, `release-readiness-${Date.now().toString(36)}.json`);

  const payload = {
    readinessVersion: "v1",
    generatedAtIso: new Date().toISOString(),
    defaultValidationCommand: "validate:all",
    pass: failures.length === 0,
    files: {
      validationSummary: validationSummaryPath,
      regression: regressionPath,
      cutoverReadiness: cutoverPath,
      failureInjection: failureInjectionPath,
      soak: soakPath,
      goalPolicyFileValidation: goalPolicyValidationPath,
      commandLogDir: options.commandLogDir || null,
      commandsFile: options.commandsFile || null,
    },
    requiredArtifacts,
    releaseCommandLogs,
    checks: {
      validationSummaryPassed: Boolean(validationSummary?.gates?.passed),
      regressionPassed: Boolean(
        regressionSummary?.pass === true || regressionSummary?.passed === true,
      ),
      cutoverReadinessPassed: Boolean(cutoverSummary?.pass),
      requireGoalPolicyFileValidationReport: options.requireGoalPolicyFileValidationReport,
      goalPolicyFileValidationPassed: goalPolicyValidationSummary?.pass === true,
      requireGoalPolicySourceConsistencyReport:
        options.requireGoalPolicySourceConsistencyReport,
      goalPolicySourceConsistencyReported,
      goalPolicySourceConsistencyPass: goalPolicySourceConsistencyPassed,
      goalPolicySourceConsistencyPassed,
      goalPolicySourceConsistencyOverlapTransitions:
        goalPolicySourceConsistencyOverlapTransitions.length > 0
          ? goalPolicySourceConsistencyOverlapTransitions
          : null,
      goalPolicySourceConsistencyConflictTransitions:
        goalPolicySourceConsistencyConflictTransitions.length > 0
          ? goalPolicySourceConsistencyConflictTransitions
          : null,
      commandLogsMissing: commandLogs.missing,
      discoveredCommandLogs: commandLogs.discovered,
      requiredReleaseCommands,
      missingRequiredCommands,
      executedReleaseCommands: Array.from(executedReleaseCommands).sort(),
      missingCommandLogFiles,
      commandFailures,
      validationCommandsPassed:
        missingRequiredCommands.length === 0 &&
        missingCommandLogFiles.length === 0 &&
        commandFailures.length === 0,
      soakSloRequired: requireSoakSlo,
      soakSloPassed:
        !requireSoakSlo || (Boolean(soakSloPath) && soakSloSummary?.pass === true),
      soakSloPath: soakSloPath || null,
    },
    failures,
  };

  const schemaValidationResult = validateManifestSchema("release-readiness", payload);
  if (!schemaValidationResult.valid) {
    for (const issue of schemaValidationResult.errors) {
      failures.push(`schema_validation_error:${issue}`);
    }
    payload.pass = false;
  }
  payload.schemaValidation = schemaValidationResult;

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${outPath}\n`);
  if (!payload.pass) {
    process.stderr.write(`Release readiness failed:\n- ${failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
