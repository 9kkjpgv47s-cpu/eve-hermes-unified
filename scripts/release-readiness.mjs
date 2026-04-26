#!/usr/bin/env node
import { readdir, readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const options = {
    evidenceDir: "",
    out: "",
    commandLogDir: "",
    commandsFile: "",
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
      command: String(item.command ?? ""),
      logFile: String(item.logFile ?? ""),
      exitCode: Number(item.exitCode),
      status: item.status === "passed" || item.status === "failed" ? item.status : "failed",
    }));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const evidenceDir = path.resolve(options.evidenceDir);
  const validationSummaryPath = await newestFileInDir(evidenceDir, "validation-summary-");
  const regressionPath = await newestFileInDir(evidenceDir, "regression-eve-primary-");
  const cutoverPath = await newestFileInDir(evidenceDir, "cutover-readiness-");
  const failureInjectionPath = await newestFileInDir(evidenceDir, "failure-injection-");
  const soakPath = await newestFileInDir(evidenceDir, "soak-");

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
  const requiredArtifacts = [
    { name: "validation-summary", path: validationSummaryPath, present: Boolean(validationSummaryPath) },
    { name: "regression-eve-primary", path: regressionPath, present: Boolean(regressionPath) },
    { name: "cutover-readiness", path: cutoverPath, present: Boolean(cutoverPath) },
    { name: "failure-injection", path: failureInjectionPath, present: Boolean(failureInjectionPath) },
    { name: "soak", path: soakPath, present: Boolean(soakPath) },
  ];

  let validationSummary = null;
  let regressionSummary = null;
  let cutoverSummary = null;
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

  const commandLogs = await evaluateCommandLogs(options.commandLogDir);
  if (commandLogs.missing.length > 0) {
    failures.push(`missing_command_logs:${commandLogs.missing.join(",")}`);
  }
  const releaseCommandLogs = await readCommandsFile(options.commandsFile);
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
      commandLogsMissing: commandLogs.missing,
      discoveredCommandLogs: commandLogs.discovered,
      commandFailures: releaseCommandLogs.filter(
        (entry) => entry.status !== "passed" || entry.exitCode !== 0,
      ),
    },
    failures,
  };

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
