#!/usr/bin/env node
import { access, cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { validateManifestSchema } from "./validate-manifest-schema.mjs";

function parseArgs(argv) {
  const options = {
    evidenceDir: "",
    releaseReadinessPath: "",
    initialScopePath: "",
    bundleDir: "",
    archivePath: "",
    manifestOut: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--evidence-dir") {
      options.evidenceDir = value ?? "";
      index += 1;
    } else if (arg === "--release-readiness") {
      options.releaseReadinessPath = value ?? "";
      index += 1;
    } else if (arg === "--initial-scope") {
      options.initialScopePath = value ?? "";
      index += 1;
    } else if (arg === "--bundle-dir") {
      options.bundleDir = value ?? "";
      index += 1;
    } else if (arg === "--archive-path") {
      options.archivePath = value ?? "";
      index += 1;
    } else if (arg === "--manifest-out") {
      options.manifestOut = value ?? "";
      index += 1;
    }
  }
  return options;
}

async function exists(targetPath) {
  if (!targetPath) {
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
  const raw = await readFile(targetPath, "utf8");
  return JSON.parse(raw);
}

function resolveMaybePath(rawPath) {
  const normalized = String(rawPath ?? "").trim();
  if (!normalized) {
    return "";
  }
  return path.resolve(normalized);
}

async function isFilePath(targetPath) {
  if (!(await exists(targetPath))) {
    return false;
  }
  try {
    const details = await stat(targetPath);
    return details.isFile();
  } catch {
    return false;
  }
}

async function isDirectoryPath(targetPath) {
  if (!(await exists(targetPath))) {
    return false;
  }
  try {
    const details = await stat(targetPath);
    return details.isDirectory();
  } catch {
    return false;
  }
}

async function newestFileInDir(dir, prefix) {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(dir, { withFileTypes: true });
  const matches = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix))
    .map((entry) => path.join(dir, entry.name))
    .sort();
  return matches.length > 0 ? matches[matches.length - 1] : null;
}

async function copyIntoBundle(bundleDir, sourcePath, destinationRelative, copiedArtifacts, kind = "file") {
  const destinationPath = path.join(bundleDir, destinationRelative);
  await mkdir(path.dirname(destinationPath), { recursive: true });
  if (kind === "directory") {
    await cp(sourcePath, destinationPath, { recursive: true });
  } else {
    await cp(sourcePath, destinationPath);
  }
  copiedArtifacts.push({
    source: sourcePath,
    destination: destinationPath,
    kind,
  });
}

function runTarArchive(bundleDir, archivePath) {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", [
      "-czf",
      archivePath,
      "-C",
      path.dirname(bundleDir),
      path.basename(bundleDir),
    ]);
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`tar failed with code ${String(code)}: ${stderr}`));
    });
    child.on("error", (error) => {
      reject(error);
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const evidenceDir = path.resolve(options.evidenceDir || path.join(process.cwd(), "evidence"));
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
  const releaseReadinessCandidate =
    options.releaseReadinessPath || (await newestFileInDir(evidenceDir, "release-readiness-")) || "";
  const initialScopeCandidate =
    options.initialScopePath ||
    (await newestFileInDir(evidenceDir, "initial-scope-validation-")) ||
    "";
  const releaseReadinessPath = resolveMaybePath(releaseReadinessCandidate);
  const initialScopePath = resolveMaybePath(initialScopeCandidate);
  const bundleDir = path.resolve(
    options.bundleDir || path.join(evidenceDir, `merge-readiness-bundle-${timestamp}`),
  );
  const archivePath = path.resolve(
    options.archivePath || path.join(evidenceDir, `merge-readiness-bundle-${timestamp}.tar.gz`),
  );
  const manifestPath = path.resolve(
    options.manifestOut || path.join(bundleDir, "merge-readiness-manifest.json"),
  );

  const failures = [];
  const copiedArtifacts = [];

  let releaseReadiness = null;
  if (!(await isFilePath(releaseReadinessPath))) {
    failures.push("missing_release_readiness_report");
  } else {
    releaseReadiness = await readJson(releaseReadinessPath);
    if (!releaseReadiness?.pass) {
      failures.push("release_readiness_not_passed");
    }
  }

  let initialScope = null;
  if (!(await isFilePath(initialScopePath))) {
    failures.push("missing_initial_scope_report");
  } else {
    initialScope = await readJson(initialScopePath);
    if (!initialScope?.pass) {
      failures.push("initial_scope_not_passed");
    }
  }

  const requiredInputs = [];
  const registerRequiredInput = (name, sourcePath, required = true, kind = "file") => {
    if (!sourcePath) {
      if (required) {
        failures.push(`missing_required_input:${name}`);
      }
      return;
    }
    requiredInputs.push({ name, sourcePath, required, kind });
  };

  registerRequiredInput("release-readiness", releaseReadinessPath, true, "file");
  registerRequiredInput("initial-scope", initialScopePath, true, "file");

  if (releaseReadiness?.files) {
    registerRequiredInput("validation-summary", releaseReadiness.files.validationSummary, true, "file");
    registerRequiredInput("regression", releaseReadiness.files.regression, true, "file");
    registerRequiredInput("cutover-readiness", releaseReadiness.files.cutoverReadiness, true, "file");
    registerRequiredInput("failure-injection", releaseReadiness.files.failureInjection, true, "file");
    registerRequiredInput("soak", releaseReadiness.files.soak, true, "file");
    registerRequiredInput("release-command-results", releaseReadiness.files.commandsFile, false, "file");
    registerRequiredInput("release-command-logs", releaseReadiness.files.commandLogDir, false, "directory");
  }

  if (initialScope?.checklistPath) {
    registerRequiredInput("master-checklist", initialScope.checklistPath, false, "file");
  }

  const missingRequiredInputs = [];
  for (const item of requiredInputs) {
    const resolvedPath = resolveMaybePath(item.sourcePath);
    const inputExists =
      item.kind === "directory"
        ? await isDirectoryPath(resolvedPath)
        : await isFilePath(resolvedPath);
    if (!inputExists) {
      if (item.required) {
        missingRequiredInputs.push(item.name);
      }
      continue;
    }
    item.sourcePath = resolvedPath;
  }
  if (missingRequiredInputs.length > 0) {
    failures.push(`missing_required_inputs:${missingRequiredInputs.join(",")}`);
  }

  await rm(bundleDir, { recursive: true, force: true });
  await mkdir(bundleDir, { recursive: true });

  if (await isFilePath(releaseReadinessPath)) {
    await copyIntoBundle(bundleDir, releaseReadinessPath, "reports/release-readiness.json", copiedArtifacts);
  }
  if (await isFilePath(initialScopePath)) {
    await copyIntoBundle(bundleDir, initialScopePath, "reports/initial-scope-validation.json", copiedArtifacts);
  }

  const copyMap = [
    ["validation-summary", releaseReadiness?.files?.validationSummary, "artifacts/validation-summary.json"],
    ["regression", releaseReadiness?.files?.regression, "artifacts/regression-eve-primary.json"],
    ["cutover-readiness", releaseReadiness?.files?.cutoverReadiness, "artifacts/cutover-readiness.json"],
    ["failure-injection", releaseReadiness?.files?.failureInjection, "artifacts/failure-injection.txt"],
    ["soak", releaseReadiness?.files?.soak, "artifacts/soak.jsonl"],
    ["release-command-results", releaseReadiness?.files?.commandsFile, "commands/commands.json"],
    ["master-checklist", initialScope?.checklistPath, "docs/MASTER_EXECUTION_CHECKLIST.md"],
  ];
  for (const [name, sourcePath, destination] of copyMap) {
    if (!sourcePath) {
      continue;
    }
    const resolved = resolveMaybePath(sourcePath);
    if (await isFilePath(resolved)) {
      await copyIntoBundle(bundleDir, resolved, destination, copiedArtifacts);
    } else {
      const matchingItem = requiredInputs.find((item) => item.name === name && item.required);
      if (matchingItem) {
        failures.push(`missing_required_input:${name}`);
      }
    }
  }
  const commandLogDir = releaseReadiness?.files?.commandLogDir
    ? path.resolve(releaseReadiness.files.commandLogDir)
    : "";
  if (commandLogDir && (await isDirectoryPath(commandLogDir))) {
    await copyIntoBundle(bundleDir, commandLogDir, "commands/logs", copiedArtifacts, "directory");
  }

  const manifest = {
    bundleVersion: "v1",
    generatedAtIso: new Date().toISOString(),
    pass: failures.length === 0,
    evidenceDir,
    bundleDir,
    archivePath,
    inputs: {
      releaseReadinessPath: await isFilePath(releaseReadinessPath) ? releaseReadinessPath : null,
      initialScopePath: await isFilePath(initialScopePath) ? initialScopePath : null,
    },
    checks: {
      releaseReadinessPassed: Boolean(releaseReadiness?.pass),
      initialScopePassed: Boolean(initialScope?.pass),
      releaseValidationCommandsPassed: Boolean(releaseReadiness?.checks?.validationCommandsPassed),
      releaseFailures: Array.isArray(releaseReadiness?.failures) ? releaseReadiness.failures : [],
      initialScopeFailures: Array.isArray(initialScope?.failures) ? initialScope.failures : [],
      missingRequiredInputs,
    },
    copiedArtifacts,
    failures,
  };

  const mergeManifestSchemaValidation = validateManifestSchema("merge-bundle", manifest);
  if (!mergeManifestSchemaValidation.valid) {
    failures.push(...mergeManifestSchemaValidation.errors.map((item) => `schema_invalid:${item}`));
    manifest.pass = false;
    manifest.checks.schemaValidation = mergeManifestSchemaValidation;
  } else {
    manifest.checks.schemaValidation = mergeManifestSchemaValidation;
  }

  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  if (manifest.pass) {
    await runTarArchive(bundleDir, archivePath);
  }

  process.stdout.write(`${manifestPath}\n`);
  if (!manifest.pass) {
    process.stderr.write(`Merge readiness bundle failed:\n- ${failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
