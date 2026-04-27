#!/usr/bin/env node
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { validateManifestSchema } from "./validate-manifest-schema.mjs";

const REQUIRED_BUNDLE_FILES = [
  "reports/release-readiness.json",
  "reports/initial-scope-validation.json",
  "artifacts/validation-summary.json",
  "artifacts/regression-eve-primary.json",
  "artifacts/cutover-readiness.json",
  "artifacts/failure-injection.txt",
  "artifacts/soak.jsonl",
  "artifacts/goal-policy-file-validation.json",
];

function parseArgs(argv) {
  const options = {
    evidenceDir: "",
    bundleDir: "",
    bundleManifest: "",
    archive: "",
    out: "",
    requireArchive: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--evidence-dir") {
      options.evidenceDir = value ?? "";
      index += 1;
    } else if (arg === "--bundle-dir") {
      options.bundleDir = value ?? "";
      index += 1;
    } else if (arg === "--bundle-manifest") {
      options.bundleManifest = value ?? "";
      index += 1;
    } else if (arg === "--archive") {
      options.archive = value ?? "";
      index += 1;
    } else if (arg === "--out") {
      options.out = value ?? "";
      index += 1;
    } else if (arg === "--no-require-archive") {
      options.requireArchive = false;
    }
  }
  return options;
}

function nowStamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
}

function resolveMaybePath(rawPath) {
  const normalized = String(rawPath ?? "").trim();
  if (!normalized) {
    return "";
  }
  return path.resolve(normalized);
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

async function isFile(targetPath) {
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

async function isDirectory(targetPath) {
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

async function newestBundleDirectory(evidenceDir) {
  const entries = await readdir(evidenceDir, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("merge-readiness-bundle-"))
    .map((entry) => path.join(evidenceDir, entry.name))
    .sort();
  return directories.length > 0 ? directories[directories.length - 1] : "";
}

async function readJson(targetPath) {
  const raw = await readFile(targetPath, "utf8");
  return JSON.parse(raw);
}

async function listTarEntries(archivePath) {
  return await new Promise((resolve, reject) => {
    const child = spawn("tar", ["-tzf", archivePath]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`tar -tzf failed with code ${String(code)}: ${stderr}`));
        return;
      }
      const entries = stdout
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      resolve(entries);
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const evidenceDir = resolveMaybePath(options.evidenceDir) || path.resolve(process.cwd(), "evidence");
  const requestedBundleDir = resolveMaybePath(options.bundleDir);
  const requestedManifestPath = resolveMaybePath(options.bundleManifest);
  const selectedBundleDir =
    requestedBundleDir ||
    (requestedManifestPath ? path.dirname(requestedManifestPath) : await newestBundleDirectory(evidenceDir));
  const selectedManifestPath =
    requestedManifestPath ||
    (selectedBundleDir ? path.join(selectedBundleDir, "merge-readiness-manifest.json") : "");
  const outPath =
    resolveMaybePath(options.out) || path.join(evidenceDir, `bundle-verification-${nowStamp()}.json`);

  const failures = [];
  const checks = {
    manifestSchemaValid: false,
    bundleManifestPass: false,
    releaseReadinessSchemaValid: false,
    releaseReadinessPass: false,
    initialScopePass: false,
    requiredBundleFilesMissing: [],
    copiedArtifactsMissing: [],
    archiveChecked: false,
    archiveMissingEntries: [],
  };

  if (!(await isDirectory(selectedBundleDir))) {
    failures.push("missing_bundle_dir");
  }
  if (!(await isFile(selectedManifestPath))) {
    failures.push("missing_bundle_manifest");
  }

  let bundleManifest = null;
  if (await isFile(selectedManifestPath)) {
    bundleManifest = await readJson(selectedManifestPath);
    const schema = validateManifestSchema("merge-bundle", bundleManifest);
    checks.manifestSchemaValid = schema.valid;
    if (!schema.valid) {
      failures.push(...schema.errors.map((error) => `bundle_manifest_schema_invalid:${error}`));
    }
    checks.bundleManifestPass = Boolean(bundleManifest?.pass);
    if (!bundleManifest?.pass) {
      failures.push("bundle_manifest_not_passed");
    }
  }

  if (await isDirectory(selectedBundleDir)) {
    for (const requiredRelative of REQUIRED_BUNDLE_FILES) {
      const resolved = path.join(selectedBundleDir, requiredRelative);
      if (!(await isFile(resolved))) {
        checks.requiredBundleFilesMissing.push(requiredRelative);
      }
    }
    for (const copiedArtifact of Array.isArray(bundleManifest?.copiedArtifacts)
      ? bundleManifest.copiedArtifacts
      : []) {
      const destinationPath = resolveMaybePath(copiedArtifact?.destination);
      const manifestBundleDir = resolveMaybePath(bundleManifest?.bundleDir);
      const relativeDestination =
        manifestBundleDir && destinationPath
          ? path.relative(manifestBundleDir, destinationPath)
          : "";
      const isRelativeInsideBundle =
        relativeDestination &&
        relativeDestination !== "." &&
        !relativeDestination.startsWith("..") &&
        !path.isAbsolute(relativeDestination);
      const projectedDestination = isRelativeInsideBundle
        ? path.join(selectedBundleDir, relativeDestination)
        : "";
      const destinationExists =
        copiedArtifact?.kind === "directory"
          ? await isDirectory(projectedDestination)
          : await isFile(projectedDestination);
      if (!destinationExists) {
        checks.copiedArtifactsMissing.push(
          String(isRelativeInsideBundle ? projectedDestination : copiedArtifact?.destination ?? ""),
        );
      }
    }
  }
  if (checks.requiredBundleFilesMissing.length > 0) {
    failures.push(`required_bundle_files_missing:${checks.requiredBundleFilesMissing.join(",")}`);
  }
  if (checks.copiedArtifactsMissing.length > 0) {
    failures.push(`copied_artifacts_missing:${checks.copiedArtifactsMissing.join(",")}`);
  }

  const bundledReleaseReadinessPath = selectedBundleDir
    ? path.join(selectedBundleDir, "reports/release-readiness.json")
    : "";
  if (await isFile(bundledReleaseReadinessPath)) {
    const releasePayload = await readJson(bundledReleaseReadinessPath);
    const releaseSchema = validateManifestSchema("release-readiness", releasePayload);
    checks.releaseReadinessSchemaValid = releaseSchema.valid;
    if (!releaseSchema.valid) {
      failures.push(...releaseSchema.errors.map((error) => `release_manifest_schema_invalid:${error}`));
    }
    checks.releaseReadinessPass = Boolean(releasePayload?.pass);
    if (!releasePayload?.pass) {
      failures.push("release_manifest_not_passed");
    }
  } else {
    failures.push("missing_bundled_release_manifest");
  }

  const bundledInitialScopePath = selectedBundleDir
    ? path.join(selectedBundleDir, "reports/initial-scope-validation.json")
    : "";
  if (await isFile(bundledInitialScopePath)) {
    const initialScopePayload = await readJson(bundledInitialScopePath);
    checks.initialScopePass = Boolean(initialScopePayload?.pass);
    if (!initialScopePayload?.pass) {
      failures.push("initial_scope_manifest_not_passed");
    }
  } else {
    failures.push("missing_bundled_initial_scope_manifest");
  }

  const explicitArchivePath = resolveMaybePath(options.archive);
  const manifestArchivePath = resolveMaybePath(bundleManifest?.archivePath);
  const derivedArchivePath = selectedBundleDir ? `${selectedBundleDir}.tar.gz` : "";
  let selectedArchivePath = explicitArchivePath;
  if (!selectedArchivePath) {
    if (await isFile(manifestArchivePath)) {
      selectedArchivePath = manifestArchivePath;
    } else if (await isFile(derivedArchivePath)) {
      selectedArchivePath = derivedArchivePath;
    } else {
      selectedArchivePath = manifestArchivePath || derivedArchivePath;
    }
  }
  if (options.requireArchive) {
    checks.archiveChecked = true;
    if (!(await isFile(selectedArchivePath))) {
      failures.push("missing_bundle_archive");
    } else {
      const archiveEntries = await listTarEntries(selectedArchivePath);
      const archiveRoot = path.basename(selectedBundleDir);
      const requiredArchiveEntries = REQUIRED_BUNDLE_FILES.map(
        (relativePath) => `${archiveRoot}/${relativePath}`,
      );
      for (const requiredEntry of requiredArchiveEntries) {
        if (!archiveEntries.includes(requiredEntry)) {
          checks.archiveMissingEntries.push(requiredEntry);
        }
      }
      if (checks.archiveMissingEntries.length > 0) {
        failures.push(`archive_missing_entries:${checks.archiveMissingEntries.join(",")}`);
      }
    }
  }

  const payload = {
    generatedAtIso: new Date().toISOString(),
    pass: failures.length === 0,
    files: {
      outPath,
      evidenceDir,
      bundleDir: selectedBundleDir || null,
      bundleManifestPath: selectedManifestPath || null,
      bundleArchivePath: selectedArchivePath || null,
    },
    checks,
    failures,
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (!payload.pass) {
    process.stderr.write(`Merge bundle verification failed:\n- ${failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
